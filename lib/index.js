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

var concurrency = 20;	//Async queue concurrency
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
	};
	
	this.getCloudantDbName = function(pipe, table){
		return pipe.name + '_' + table.name;
	};

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

		// fetch up to 500 comments by default, sorted by popularity
		amaJsonURL = amaJsonURL + '?limit=500&showmore=true&sort=top';

		if(table.id === 'top_comments_only') {
			// limit depth to fetch more records at the highest level
			amaJsonURL = amaJsonURL + '&depth=1';  
		}

		logger.info('Connecting to AMA with url ' + amaJsonURL);

		request.get(amaJsonURL, {'json': true},
			function( err, response, body ){
				if ( err ){
					logger.error('Unable to fetch AMA: ' + err );
					return done( err );
				}

				// Create an async queue to process the record with Watson Tone Analyzer
				var q = async.queue( function( post, callback ){

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

						// logger.debug('WTA response: ' + util.inspect(response));	
						// logger.debug('WTA body: ' + util.inspect(body));						

						if(response.statusCode >= 300) {
							msg = 'Call to Watson Tone Analyzer URL ' + response.request.uri.href + ' returned status ' + response.statusCode + ' (' + response.body.error + ')';
							logger.error(msg);
							logger.info('FFDC - post: ' + util.inspect(post,5));
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
																      category_id: 'socialevel_tone', 
																      category_name: 'Social Tone' 
																    } 
															      ]
										        },
							    sentences_tone: ...

							}			     

                        	*/

							// logger.debug('Document tone categories: ' + util.inspect(body.document_tone.tone_categories));	

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
									processed_record_count : 0,		      // total number of records sent to Tone Analyzer
									missing_record_count : 0,             // total number of records for which text needs to be manually loaded
									max_processed_level : 1,        	  // identifies how many levels of comments were processed (1 is minimum)
									level_stats : {},				      // statistics for each level within the thread
									parser_warnings : 0                   // if non-zero, potential parsing issues were detected
								};

				/*
						comment1              (level 1)
						  comment1.1          (level 2)
						  comment1.2          (level 2)
						    comment1.2.1      (level 3)
						comment2              (level 1)
						  comment2.1          (level 2)
						    comment2.1.1      (level 3)
						    comment2.1.1.1    (level 4)
						 comment3             (level 1)

				*/	

				// If the user chose option top_comments, things (comments at level 2+) are skipped			
				if(table.id === 'top_comments_only') {
					// process only comments at level 1
					logger.info('Analyzing only one level.');		
					amaStats.max_depth_to_inspect = 1;
				}				

				/*
				 * Local function. Collects comment information at the current level and invokes itself
				 *  to collect information at lower levels.
				 * @param things AMA records 
				 * @param level - current level
				 */
				var processSubtree = function(things, level) {
						// stop if there is nothing to process or if the maximum processing depth has been reached
						if(((! things) && (level > 1)) || ((amaStats.max_depth_to_inspect) && (level > amaStats.max_depth_to_inspect))){
							return;
						}

						// update statistics	
						if(amaStats.max_processed_level < level) {
							amaStats.max_processed_level = level;	
						}

						if(! amaStats.level_stats['level_' + level]) {
							amaStats.level_stats['level_' + level] = {
																		processed : 0,
																		warnings : 0,
																		missing	: 0
																	};
						}
						
						// process records 
						if(things.hasOwnProperty('kind') && (things.kind === 'Listing')) {
								if((things.hasOwnProperty('data')) && (things.data.hasOwnProperty('children'))) {
									_.forEach(things.data.children, function (thing) {
											// for a definition of thing refer to the Reddit API doc
											if(thing.hasOwnProperty('data')) {
												if((thing.data.hasOwnProperty('selftext')) || (thing.data.hasOwnProperty('body'))) {
													// the record includes text that can be analyzed; submit comment for Tone Analyzer processing
													q.push( thing.data );	
													amaStats.processed_record_count++;
													amaStats.level_stats['level_' + level].processed++;
												}
												else {
													// the record does not include text that can be analyzed; skip

													if(thing.kind === 'more'){
														// type "more" indicates that there are things (e.g. comments) in this subtree that were not loaded but could be 
														// retrieved using https://www.reddit.com/dev/api#GET_api_morechildren
												    	// TODO additional processing is required
												    	// calculate total (across all levels)
												    	if(thing.data.count) {
															amaStats.missing_record_count = amaStats.missing_record_count + thing.data.count; 
												    		// calculate total for current level
												    		amaStats.level_stats['level_' + level].missing = amaStats.level_stats['level_' + level].missing + thing.data.count;														 
												    	}
													}
													else {
														  // unknown record type 	
														  amaStats.parser_warnings++;
														  amaStats.level_stats['level_' + level].warnings++;
														  logger.warn('Potential parser error detected for record type ' + thing.kind + ' at level ' + level + ': ' + util.inspect(thing.data,3));
													}	
												}

												// process sub-tree things (which are typically comments/replies)
												// before processung other things at the current level
												processSubtree(thing.data.replies, level + 1);
											}	
									});
								} // ! data.children
								else {
									// potential parser logic error
									amaStats.parser_warnings++;
									amaStats.level_stats['level_' + level].warnings++;
									logger.warn('Potential parser error detected at level ' + level + ': ' + util.inspect(things,3));
								}
						}
						else {
								// potential parser logic error
								amaStats.parser_warnings++;
								amaStats.level_stats['level_' + level].warnings++;
								logger.warn('Potential parser error detected at level ' + level + ': ' + util.inspect(things,3));
						}
				};

				// inspect the AMA base tree
				logger.info('Processing AMA base tree for AMA URL ' + amaJsonURL);

				_.forEach(body, function (listing) {
					processSubtree(listing, 1);							
				});
				
				
				// local helper function; displays processing statistics`
				var logStats = function () {
					logger.info('Records sent to Tone Analyzer: ' + amaStats.processed_record_count);
					// these records could be fetched using other API calls
					logger.info('Records missing (no comment text available): ' + amaStats.missing_record_count);
					logger.info('Maximum processed comment thread depth: ' + amaStats.max_processed_level);
					if(amaStats.parser_warnings > 0) {
						// Potential issue with parser logic. If a non-zero value is reported, the base tree should be reviewed.
						logger.warn('Potential base tree parsing issues: ' + amaStats.parser_warnings);	
					}
					
					logger.debug('AMA thread statistics: ' + util.inspect(amaStats.level_stats,3));

				};

				// Drain function is invoked after all posts have been processed
				q.drain = function(){
					// pipe processing complete
					logStats();
					return done();
				};

				// if the queue is empty asynchronous processing has already completed (or there was nothing to process)
				if(q.idle()) {
					logStats();
					return done();
				}
			}
		);
	};
}

//Extend event Emitter
require('util').inherits(redditConnector, connectorExt);

module.exports = new redditConnector();
