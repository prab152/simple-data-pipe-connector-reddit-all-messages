//-------------------------------------------------------------------------------
// Copyright IBM Corp. 2015
//
// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//-------------------------------------------------------------------------------

'use strict';

var request = require('request');
var _ = require('lodash');
var async = require('async');
var pipesSDK = require.main.require('simple-data-pipe-sdk');
var connectorExt = pipesSDK.connectorExt;
var bluemixHelperConfig = require.main.require('bluemix-helper-config');
var configManager = bluemixHelperConfig.configManager;
var vcapServices = bluemixHelperConfig.vcapServices;
var util = require('util');

var concurrency = 10;	//Async queue concurrency
/**
 * Pipes Connector for Reddit
 */
function redditConnector( parentDirPath ){

	//Call constructor from super class
	connectorExt.call(this, 'reddit', 'Reddit AMA', {
		extraRequiredFields: 'amaURL',
		useOAuth: false,
		useCustomTables: true
	});
	
	this.getTablePrefix = function(){
		return 'reddit';
	}
	
	this.getCloudantDbName = function(pipe, table){
		return pipe.name + '_' + table.name;
	}

	var watsonToneAnalyzerService = vcapServices.getService( configManager.get('WATSON_TONE_ANALYZER') || 'tone analyzer' );
	
	this.fetchRecords = function( table, pushRecordFn, done, pipeRunStep, pipeRunStats, logger, pipe, pipeRunner ){

		if ( !watsonToneAnalyzerService ){
			var msg = 'Unable to find Watson Tone Analyzer Service';
			logger.error( msg );
			return done( msg );
		}

		if (( !pipe.amaURL ) || (pipe.amaURL.length < 1)){
			return done('Missing or empty field amaURL');
		}

		var amaJsonURL = '';
		// append json suffix to amaURL
		// input: https://www.reddit.com/r/IAmA/comments/3ilzey/were_a_bunch_of_developers_from_ibm_ask_us.json or
		//        https://www.reddit.com/r/IAmA/comments/3ilzey/were_a_bunch_of_developers_from_ibm_ask_us or
		//        https://www.reddit.com/r/IAmA/comments/3ilzey/were_a_bunch_of_developers_from_ibm_ask_us/ 
		// output https://www.reddit.com/r/IAmA/comments/3ilzey/were_a_bunch_of_developers_from_ibm_ask_us.json

        if(pipe.amaURL.match(/\.json$/)) {
        	amaJsonURL = pipe.amaURL;
        }
        else {
			if(pipe.amaURL.charAt(pipe.amaURL.length-1) == '/') {
				amaJsonURL = pipe.amaURL.replace(/\/+$/,'.json');
			}
			else {
				amaJsonURL = pipe.amaURL + '.json';
			}
		}

		logger.info('Connecting to AMA with url ' + amaJsonURL);

		request.get(amaJsonURL, {'json': true},
			function( err, response, body ){
				if ( err ){
					logger.error('Unable to fetch AMA: ' + err );
					return done( err );
				}
	
//				logger.debug('Reddit API response: ' + response);

				// Create an async queue to process the record with Watson Tone Analyzer
				var q = async.queue( function( post, callback ){

//					logger.debug(util.inspect(post));

					var msg = '';

					// Call Tone analyzer to get sentiments from the post
					// https://www.ibm.com/smarterplanet/us/en/ibmwatson/developercloud/doc/tone-analyzer/output.shtml
					request.post( watsonToneAnalyzerService.credentials.url + '/v3/tone?version=2016-02-11',{
						'auth': {
						  'user': watsonToneAnalyzerService.credentials.username,
						  'pass': watsonToneAnalyzerService.credentials.password,
						  'sendImmediately': true
						},
						'json': {
							'text': post.selftext || post.body
						}
					}, function( err, response, body ){

						if ( err ){
							msg = 'Error querying Watson Tone Analyzer service: ' + err;
							logger.error(msg);
							return callback( msg );
						}

//						logger.debug('WTA response: ' + util.inspect(response));	
//						logger.debug('WTA body: ' + util.inspect(body));						

						if(response.statusCode >= 300) {
							msg = 'Call to Watson Tone Analyzer URL ' + response.request.uri.href + ' returned status ' + response.statusCode + ' (' + response.body.error + ')';
							logger.error(msg);
							logger.info('FFDC - post: ' + util.inspect(post));
							return callback(msg);
						}
						
						var sentiments = {
											author: post.author,
											created: post.created_utc,
											edited: post.edited,
											id: post.id,
											num_comments: post.num_comments,
											title: post.title || '',
											text: post.selftext || post.body
                                         };

                        if(body.document_tone) {

                        	/*

                        	Tone Analyzer API v3 output (http://www.ibm.com/smarterplanet/us/en/ibmwatson/developercloud/tone-analyzer/api/v3/)
							
							{ 
							    document_tone: {
	
												tone_categories: [ 
																  	{ 
																  	  tones: [ [Object], [Object], [Object], [Object], [Object] ], 
																  	  category_id: 'emotion_tone', 
																      category_name: 'Emotion Tone' 
																    }, 
																    { 
																      tones: [ [Object], [Object], [Object] ], 
																      category_id: 'writing_tone', 
																      category_name: 'Writing Tone' 
																    }, 
																    { 
																      tones: [ [Object], [Object], [Object], [Object], [Object] ], 
																      category_id: 'social_tone', 
																      category_name: 'Social Tone' 
																    } 
															      ]
										        },
							    sentences_tone: ...

							}			     

                        	*/

//							logger.debug('Document tone categories: ' + util.inspect(body.document_tone.tone_categories));	

							var generate_flat_document_structure = (pipe.outputFormat === 'JSON_flat');

							if(generate_flat_document_structure) {
								_.forEach(body.document_tone.tone_categories, function(tone_category) {
									_.forEach(tone_category.tones, function(tone){
										// Sample tone definition: { score: 0.10796, tone_id: 'anger', tone_name: 'Anger' }
										sentiments[tone.tone_name.replace(/ /g,'_')] = (parseFloat(tone.score * 100)).toFixed(2);
									});
								});

							}
							else {
								_.forEach(body.document_tone.tone_categories, function(tone_category) {
									sentiments[tone_category.category_id] = { 
										                                      category_name : tone_category.category_name,
										                                      tones: tone_category.tones 
										                                    };
									// add normalized score (between 0 and 100, two decimal places)	                                    
									_.forEach(sentiments[tone_category.category_id].tones, function(tone){
										// Sample tone definition: { score: 0.10796, tone_id: 'anger', tone_name: 'Anger' }
										tone.normalized_score = (parseFloat(tone.score * 100)).toFixed(2);
									});	                                    
								});	

							}


                        	// save in Cloudant
                            pushRecordFn(sentiments); 	

                        }   
                        else {
                        	// No tone analyzer results were returned
                        	// Don't store post in Cloudant
                        	logger.warn('No Tone Analyzer results were returned for ' + sentiments.title + '.'); 
                        }          

   						return callback();
		        	
                    }); // post
				}, concurrency ); // async
				

				var amaStats = {
									ignored_comment_count : 0,
									included_comment_count : 0,
									max_processed_thread_depth : 1
								};

				var processNextLevel = function(replies, level) {
						if(! replies) {
							return;
						}

						// logger.debug('Processing level ' + level);

						if(amaStats.max_processed_thread_depth < level) {
							amaStats.max_processed_thread_depth = level;	
						}
						
						if(replies.hasOwnProperty('kind') && (replies.kind === 'Listing')) {
								if((replies.hasOwnProperty('data')) && (replies.data.hasOwnProperty('children'))) {
									_.forEach(replies.data.children, function (reply) {
											if(reply.hasOwnProperty('data')) {
												if((reply.data.hasOwnProperty('selftext')) || (reply.data.hasOwnProperty('body'))) {
													q.push( reply.data );	
													amaStats.included_comment_count++;
												}
												else {
													amaStats.ignored_comment_count++;
													logger.debug('Ignoring record at level ' + level + ': ' + util.inspect(reply.data));
												}
												processNextLevel(reply.data.replies, level + 1);
											}	
									});
								}
						}
				};

				var level = 1;

				_.forEach( body, function( listing ){			
					if ( listing.kind == 'Listing' && listing.hasOwnProperty('data' ) ){
						if ( listing.data.hasOwnProperty('children') ){
							//Get the children from the data fields, only process the top posts for now
							_.forEach( listing.data.children, function( post ){
								if ( post.hasOwnProperty('data') ){
									amaStats.comment_count++;
									// add post to queue only if it contains text 
									if((post.data.hasOwnProperty('selftext')) || (post.data.hasOwnProperty('body'))) {
										q.push( post.data );
										amaStats.included_comment_count++;

										if(post.data.hasOwnProperty('replies')) {
											processNextLevel(post.data.replies, level + 1);
										}
									}
									else {
										amaStats.ignored_comment_count++;
										logger.debug('Ignoring record at level 1: ' + util.inspect(post.data));
									}
								}
							});
						}						
					}
				});
				
				// Drain function is invoked after all posts have been processed
				q.drain = function(){
					// pipe processing complete
					logger.info('Processed records: ' + amaStats.included_comment_count);
					logger.info('Ignored records (no comment text available): ' + amaStats.ignored_comment_count);
					logger.info('Maximum processed comment thread depth: ' + amaStats.max_processed_thread_depth);
					return done();
				}

				// if the queue is empty asynchronous processing has already completed (or there was nothing to process)
				if(q.idle()) {
					logger.info('Processed records: ' + amaStats.included_comment_count);
					logger.info('Ignored records (no comment text available): ' + amaStats.ignored_comment_count);
					logger.info('Maximum processed comment thread depth: ' + amaStats.max_processed_thread_depth);
					return done();
				}
			}
		);
	};
}

//Extend event Emitter
require('util').inherits(redditConnector, connectorExt);

module.exports = new redditConnector();
