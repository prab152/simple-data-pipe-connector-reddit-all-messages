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

var util = require('util');

var pipesSDK = require('simple-data-pipe-sdk');
var connectorExt = pipesSDK.connectorExt;

var bluemixHelperConfig = require.main.require('bluemix-helper-config');
var configManager = bluemixHelperConfig.configManager;
var global = bluemixHelperConfig.global;
var vcapServices = bluemixHelperConfig.vcapServices;

// This connector uses the passport strategy module (http://passportjs.org/) for reddit.
var dataSourcePassportStrategy = require('passport-reddit').Strategy;

var request = require('request');
var _ = require('lodash');
var async = require('async');

var concurrency = 20;	//Async queue concurrency

/**
 * Pipes Connector for Reddit
 */
function oAuthRedditConnector() {

	var connectorInfo = {
		id: require('../package.json').simple_data_pipe.name,
		name: 'Reddit AMA'
	};

	var connectorOptions = {
		recreateTargetDb: true, // if set (default: false) all data currently stored in the staging database is removed prior to data load
		useCustomTables: true   // keep true (default: false)
	};

	// Call constructor from super class;
	connectorExt.call(this,
		connectorInfo.id,
		connectorInfo.name,
		connectorOptions
	);

	// reddit API access requires a unique user-agent HTTP header; change this default (https://github.com/reddit/reddit/wiki/API)
	var userAgentHTTPHeaderValue = 'Simple Data Pipe demo application';

	// writes to the application's global log file
	var globalLog = this.globalLog;

	// keep track of the comment tree
	var commentTree = null;

	// tone analyzer service
	var watsonToneAnalyzerService = vcapServices.getService( configManager.get('WATSON_TONE_ANALYZER') || 'tone analyzer' );

	/*
	 * ---------------------------------------------------------------------------------------
	 * Override Passport-specific connector methods:
	 *  - getPassportAuthorizationParams
	 *  - getPassportStrategy
	 *  - passportAuthCallbackPostProcessing
	 * ---------------------------------------------------------------------------------------
	 */

	/**
	 * Returns a fully configured Passport strategy for reddit.
	 * @override
	 * @returns {duration:'permanent'} {@link https://github.com/reddit/reddit/wiki/OAuth2}
	 */
	this.getPassportAuthorizationParams = function() {
		return {duration:'permanent'};
	}; // getPassportAuthorizationParams

	/**
	 * Returns a fully configured Passport strategy for reddit. The passport verify
	 * callback adds two properties to the profile: oauth_access_token and oauth_refresh_token.
	 * @override
	 * @returns {Object} Passport strategy for reddit.
	 * @returns {Object} profile - user profile returned by reddit
	 * @returns {string} profile.oauth_access_token
	 * @returns {string} profile.oauth_refresh_token
	 */
	this.getPassportStrategy = function(pipe) {

		return new dataSourcePassportStrategy({
				clientID: pipe.clientId,											 // mandatory; oAuth client id; do not change
				clientSecret: pipe.clientSecret,									 // mandatory; oAuth client secret;do not change
				callbackURL: global.getHostUrl() + '/authCallback',		 			 // mandatory; oAuth callback; do not change
				customHeaders: {'User-Agent': userAgentHTTPHeaderValue},             // reddit requires a unique user-agent HTTP header
				scope: 'identity,read'												 // See https://www.reddit.com/dev/api/oauth for scope list
			},
			function(accessToken, refreshToken, profile, done) {

				process.nextTick(function () {

					// attach the obtained access token to the user profile
					profile.oauth_access_token = accessToken;

					// attach the obtained refresh token to the user profile
					profile.oauth_refresh_token = refreshToken;

					// return the augmented profile
					return done(null, profile);
				});

			});
	}; // getPassportStrategy

	/**
	 * Attach OAuth access token and OAuth refresh token to data pipe configuration.
	 * @param {Object} profile - the output returned by the passport verify callback
	 * @param {pipe} pipe - data pipe configuration, for which OAuth processing has been completed
	 * @param callback(err, pipe ) error information in case of a problem or the updated pipe
	 */
	this.passportAuthCallbackPostProcessing = function( profile, pipe, callback ){

		if((!profile) || (! profile.oauth_access_token) || (! profile.oauth_refresh_token)) {
			globalLog.error('Internal application error: OAuth parameter is missing in passportAuthCallbackPostProcessing');
			return callback('Internal application error: OAuth parameter is missing.');
		}

		if(!pipe) {
			globalLog.error('Internal application error: data pipe configuration parameter is missing in passportAuthCallbackPostProcessing');
			return callback('Internal application error: data pipe configuration parameter is missing.');
		}

		// Attach the token(s) and other relevant information from the profile to the pipe configuration.
		// Use this information in the connector code to access the data source

		pipe.oAuth = {
			accessToken : profile.oauth_access_token,
			refreshToken: profile.oauth_refresh_token
		};

		pipe.tables = [];
		pipe.tables.push({name:'top_comments_only', label:'Top comments only', description : ''});
		pipe.tables.push({name:'top_comments_replies', label:'Top comments and replies', description : ''});

		callback(null, pipe);

	}; // passportAuthCallbackPostProcessing

	/*
	 * ---------------------------------------------------------------------------------------
	 * Override general connector methods:
	 *  - doConnectStep: verify that OAuth information is still valid
	 *  - fetchRecords:  load data from data source
	 * ---------------------------------------------------------------------------------------
	 */

	/**
	 * Customization might be required.
	 * During data pipe runs, this method is invoked first. Add custom code as required, for example to verify that the
	 * OAuth token has not expired.
	 * @param done: callback that must be called when the connection is established
	 * @param pipeRunStep
	 * @param pipeRunStats
	 * @param pipeRunLog
	 * @param pipe
	 * @param pipeRunner
	 */
	this.doConnectStep = function( done, pipeRunStep, pipeRunStats, pipeRunLog, pipe, pipeRunner ){

		//
		// Obtain new access token before trying to fetch data. Access tokens expire after an hour.
		// See https://github.com/reddit/reddit/wiki/OAuth2
		//
		request.post({
				uri: 'https://ssl.reddit.com/api/v1/access_token',
				headers: {
					'User-Agent' : userAgentHTTPHeaderValue,
					'Authorization' : 'Basic ' + new Buffer(pipe.clientId + ':' + pipe.clientSecret).toString('base64')
				},
				form: {
					grant_type : 'refresh_token',
					refresh_token : pipe.oAuth.refreshToken
				}
			},
			function(err, response, body) {

				if(err) {
					// there was a problem with the request; abort processing
					// by calling the callback and passing along an error message
					pipeRunLog.error('OAuth token refresh for data pipe ' +  pipe._id + ' failed due to error: ' + err);
					return done('OAuth token refresh error: ' + err);
				}

				// Sample body:
				//              {
				//           	 "access_token": "5368999-SryekB08157Pp7PZ-lfn654J1E",
				//               "token_type": "bearer",
				//               "expires_in": 3600,
				//               "scope": "identity read"
				//              }

				var accessToken = JSON.parse(body).access_token;
				if(accessToken) {
					pipeRunLog.info('OAuth access token for data pipe ' + pipe._id + ' was refreshed.');
					pipe.oAuth.accessToken = accessToken;
					return done();
				}
				else {
					pipeRunLog.error('OAuth access token for data pipe ' + pipe._id + ' could not be retrieved from reddit response: ' + util.inspect(body,3));
					return done('OAuth access token could not be refreshed.');
				}
			});

	}; // doConnectStep

	/**
	 * Fetch Reddit article and comment tree to store in Cloudant.
	 * @param dataSet - dataSet.name contains the data set name that was (directly or indirectly) selected by the user
	 * @param done(err) - callback funtion to be invoked after processing is complete (or a fatal error has been encountered)
	 * @param pipe - data pipe configuration
	 * @param pipeRunLog - a dedicated logger instance that is only available during data pipe runs
	 */
	this.fetchRecords = function( dataSet, pushRecordFn, done, pipeRunStep, pipeRunStats, pipeRunLog, pipe, pipeRunner ){

		// look for watson tone analyzer service
		if ( !watsonToneAnalyzerService ){
			var msg = 'Unable to find Watson Tone Analyzer Service';
			pipeRunLog.error( msg );
			return done( msg );
		}

		if (( !pipe.amaURL ) || (pipe.amaURL.length < 1)){
			return done('Missing or empty field amaURL');
		}
		var amaURLLower = pipe.amaURL.toLowerCase();
		var amaURLMatch = "r/iama/comments/";
		var amaURLMatchIndex = amaURLLower.indexOf(amaURLMatch);
		if (amaURLMatchIndex <= 0) {
			return done('Invalid amaURL');
		}
		var articleId = pipe.amaURL.substring(amaURLMatchIndex+amaURLMatch.length);
		var articleIdSlashIndex = articleId.indexOf('/');
		if (articleIdSlashIndex > 0) {
			articleId = articleId.substring(0,articleIdSlashIndex);
		}
		var topCommentsOnly = (dataSet.name == 'top_comments_only');

		console.log("pipe.amaURL = " + pipe.amaURL);
		console.log("dataSet = " + JSON.stringify(dataSet));
		console.log("articleId = " + articleId);

		// The data set is typically selected by the user in the "Filter Data" panel during the pipe configuration step
		// dataSet: {name: 'data set name'}. However, if you enabled the ALL option (see get Tables) and it was selected,
		// the fetchRecords function is invoked asynchronously once for each data set.
		// Note: Reddit enforces API call rules: https://github.com/reddit/reddit/wiki/API.

		// Bunyan logging - https://github.com/trentm/node-bunyan
		// The log file is attached to the pipe run document, which is stored in the Cloudant repository database named pipe_db.
		// To enable debug logging, set environment variable DEBUG to '*' or to 'sdp-pipe-run' (without the quotes).
		if (topCommentsOnly) {
			pipeRunLog.info('Fetching top comments for data set ' + articleId + ' from Reddit.');
		}
		else {
			pipeRunLog.info('Fetching top comments and replies for data set ' + articleId + ' from Reddit.');
		}

		commentTree = new RedditCommentTree();

		getCommentTree(pushRecordFn, pipeRunLog, pipe, done, articleId, topCommentsOnly);

	}; // fetchRecords

	/**
	 * Prefix Cloudant databases with connector id.
	 */
	this.getTablePrefix = function(){
		// The prefix is used to generate names for the Cloudant staging databases that store your data.
		// The recommended value is the connector ID to assure uniqueness.
		return connectorInfo.id;
	};

	/**
	 * Load an article and it's entire comment tree.
	 * @param pushRecordFn - function to be invoked to push records through the pipeline
	 * @param pipeRunLog - a dedicated logger instance that is only available during data pipe runs
	 * @param pipe - data pipe configuration
	 * @param done(err) - callback function to be invoked after processing is complete (or a fatal error has been encountered)
	 * @param articleId - the id of the Reddit article to retrieve
	 * @param topCommentsOnly - a boolean value specifying whether or not to retrive the top comments only
	 */
	var getCommentTree = function(pushRecordFn, pipeRunLog, pipe, done, articleId, topCommentsOnly) {
		// Create an async queue to process each record with Watson Tone Analyzer
		var toneAnalyzerQueue = async.queue(function(post,callback) {
			processWatsonToneAnalyzer(pushRecordFn, pipeRunLog, pipe, post, callback)
		}, concurrency);
		// Create an async queue to process each "more" request
		var loadMoreCommentsQueue = async.queue(function(data,callback) {
			getMoreComments(pushRecordFn, pipeRunLog, pipe, articleId, toneAnalyzerQueue, loadMoreCommentsQueue, topCommentsOnly, data, callback);
		}, 1);

		var uri = articleId + '?limit=500&showmore=true&sort=top';
		if (topCommentsOnly) {
			uri += "&depth=0";
		}
		var requestOptions = {
			url : 'https://oauth.reddit.com/r/iAMA/comments/'+ uri, // GET [/r/subreddit]/comments/article
			headers: {
				'User-Agent' : userAgentHTTPHeaderValue,
				'Authorization' : 'bearer ' + pipe.oAuth.accessToken
			}
		};

		// make the request to the Reddit API
		request.get(requestOptions, function(err, response, body) {
			if(err) {
				// there was a problem with the request; abort processing
				pipeRunLog.error('Error fetching AMA from Reddit: ' + err);
				pipeRunLog.error('FFDC: Reddit HTTP request options: ');
				pipeRunLog.error(' ' + util.inspect(requestOptions,2));
				pipeRunLog.error('FFDC: Reddit response: ');
				pipeRunLog.error(' ' + util.inspect(response,5));
				return done(err, pipe);
			}
			//
			if(response.statusCode >= 300) {
				// invalid status, abort processing
				pipeRunLog.error('AMA fetch request returned status code ' + response.statusCode);
				pipeRunLog.error('FFDC: Reddit HTTP request options: ');
				pipeRunLog.error(' ' + util.inspect(requestOptions,2));
				pipeRunLog.error('FFDC: Reddit response: ');
				pipeRunLog.error(' ' + util.inspect(response,5));
				return done('AMA Fetch request returned status code ' + response.statusCode, null);
			}
			// parse and loop through all things
			// first thing should be the article
			// second thing should be the top level comments and their replies (and much of the comment tree)
			var things = JSON.parse(body);
			if (things && things.length > 0 && things[0].data && things[0].data.children && things[0].data.children.length > 0) {
				pipeRunLog.info('Article retrieved from Reddit with ' + things.length + ' thing(s).');
				// article
				var article = things[0].data.children[0].data;
				article.replies = undefined; // null out replies
				processArticle(pushRecordFn, pipeRunLog, pipe, toneAnalyzerQueue, article);
				// top level comments
				if (things.length > 1 && things[1].data && things[1].data.children && things[1].data.children.length > 0) {
					pipeRunLog.info(things[1].data.children.length + ' top level comment(s) retrieved from Reddit.');
					for (var i = 0; i < things[1].data.children.length; i++) {
						var kind = things[1].data.children[i].kind;
						if (kind == 't1') {
							var comment = things[1].data.children[i].data;
							processComment(pushRecordFn, pipeRunLog, pipe, comment, toneAnalyzerQueue, loadMoreCommentsQueue, !topCommentsOnly);
						}
						else if (kind == 'more') {
							// queue up loading of more comments
							// reddit API does not allow multiple calls to execture concurrently
							loadMoreCommentsQueue.push(things[1].data.children[i].data);
						}
					}
				}
				else {
					pipeRunLog.info('No top level comments retrieved from Reddit.');
				}
			}
			else {
				pipeRunLog.info('No article retrieved from Reddit.');
			}

			// wait for all processes in queues to complete
			drainQueues(toneAnalyzerQueue, loadMoreCommentsQueue, done);


			//// Invoke done callback to indicate that data set dataSet has been processed.
			//// Parameters:
			////  done()                                      // no parameter; processing completed successfully. no status message text is displayed to the end user in the monitoring view
			////  done({infoStatus: 'informational message'}) // processing completed successfully. the value of the property infoStatus is displayed to the end user in the monitoring view
			////  done({errorStatus: 'error message'})        // a fatal error was encountered during processing. the value of the property infoStatus is displayed to the end user in the monitoring view
			////  done('error message')                       // deprecated; a fatal error was encountered during processing. the message is displayed to the end user in the monitoring view
			//return done();

		}); // request.get
	};

	var drainQueues = function(toneAnalyzerQueue, loadMoreCommentsQueue, done) {

		var queuesDrained = false;

		// wait for the more comments queue to finish
		loadMoreCommentsQueue.drain = function(){
			// pipe processing complete
			//commentTree.print();
			drainToneAnalyzerQueue(toneAnalyzerQueue, done);
			queuesDrained = true;
		};

		if (! queuesDrained && loadMoreCommentsQueue.idle()) {
			// if the queue is empty asynchronous processing has already completed (or there was nothing to process)
			//commentTree.print();
			drainToneAnalyzerQueue(toneAnalyzerQueue, done);
			queuesDrained = true;
		}
	}

	var drainToneAnalyzerQueue = function(toneAnalyzerQueue, done) {

		var toneAnalyzerQueueDrained = false;

		// wait for the more comments queue to finish
		toneAnalyzerQueue.drain = function(){
			// pipe processing complete
			done();
			toneAnalyzerQueueDrained = true;
		};

		if (! toneAnalyzerQueueDrained && toneAnalyzerQueue.idle()) {
			// if the queue is empty asynchronous processing has already completed (or there was nothing to process)
			done();
			toneAnalyzerQueueDrained = true;
		}
	}

	/**
	 * Get more comments for an article.
	 * This function is called when a query to the Reddit API returns a child with a kind of 'more'.
	 * @param pushRecordFn - function to be invoked to push records through the pipeline
	 * @param pipeRunLog - a dedicated logger instance that is only available during data pipe runs
	 * @param pipe - data pipe configuration
	 * @param articleId - the id of the Reddit article to retrieve
	 * @param toneAnalyzerQueue - queue for running Watson Tone Analyzer against comments
	 * @param loadMoreCommentsQueue - queue for loading more comments
	 * @param topCommentsOnly - a boolean value specifying whether or not to retrive the top comments only
	 * @param data - data from Reddit containing the children required to load
	 * @param callback - callback to invoke when processing is complete
	 */
	var getMoreComments = function(pushRecordFn, pipeRunLog, pipe, articleId, toneAnalyzerQueue, loadMoreCommentsQueue, topCommentsOnly, data, callback) {
		if (! data.children || data.children.length <= 0) {
			callback();
			return;
		}
		var childrenStr = '';
		for (var i=0; i<Math.min(data.children.length,20); i++) {
			if (i != 0) {
				childrenStr += ',';
			}
			childrenStr += data.children[i];
		}
		// Reddit API requires that you only request 20 at a time
		// if there are more than 20 then we add another request to queu
		if (data.children.length > 20) {
			var c = data.children.splice(20,data.children.length-20);
			loadMoreCommentsQueue.push({children:c});
		}
		pipeRunLog.info('Loading more comments from Reddit with children ' + childrenStr);
		var params = '?api%5Ftype=json';
		params += '&link%5Fid=' + encodeURIComponent('t3_' + articleId);
		params += '&children=' + encodeURIComponent(childrenStr);
		var url = 'https://oauth.reddit.com/api/morechildren' + params;
		var requestOptions = {
			url : url,
			headers: {
				'User-Agent' : userAgentHTTPHeaderValue,
				'Authorization' : 'bearer ' + pipe.oAuth.accessToken
			}
		};
		request.get(requestOptions, function(err, response, body) {
			if (err) {
				pipeRunLog.error('Error fetching more comments from Reddit: ' + err);
				pipeRunLog.error('FFDC: Reddit HTTP request options: ');
				pipeRunLog.error(' ' + util.inspect(requestOptions,2));
				pipeRunLog.error('FFDC: Reddit response: ');
				pipeRunLog.error(' ' + util.inspect(response,5));
			}
			else if (body) {
				var result = JSON.parse(body);
				if (result && result.json && result.json.data && result.json.data.things && result.json.data.things.length > 0) {
					pipeRunLog.info(result.json.data.things.length + ' more thing(s) retrieved from Reddit.');
					for (var i=0; i<result.json.data.things.length; i++) {
						var thing = result.json.data.things[i];
						if (thing.kind == 't1') {
							processComment(pushRecordFn, pipeRunLog, pipe, thing.data, toneAnalyzerQueue, loadMoreCommentsQueue, !topCommentsOnly);
						}
						else if (thing.kind == 'more') {
							// queue up loading of more comments
							// reddit API does not allow multiple calls to execture concurrently
							loadMoreCommentsQueue.push(thing.data);
						}
					}
				}
				else {
					pipeRunLog.info('No more comments retrieved from Reddit.');
				}
			}
			callback();
		});
	}

	/**
	 * Push an article to the pipe.
	 * @param pushRecordFn - function to be invoked to push records through the pipeline
	 * @param pipeRunLog - a dedicated logger instance that is only available during data pipe runs
	 * @param pipe - data pipe configuration
	 * @param toneAnalyzerQueue - queue for running Watson Tone Analyzer against article
	 * @param article - the article retrieved from Reddit
	 */
	var processArticle = function(pushRecordFn, pipeRunLog, pipe, toneAnalyzerQueue, article) {
		article.tree_path = commentTree.pushArticle(article).path;
		article.tree_level = article.tree_path.length;
		pipeRunLog.info('Processing Reddit article ' + article.name + ' with path ' + JSON.stringify(article.tree_path));
		toneAnalyzerQueue.push(article);
	}

	/**
	 * Push a comment to the pipe and process all replies to a comment recursively.
	 * @param pushRecordFn - function to be invoked to push records through the pipeline
	 * @param pipeRunLog - a dedicated logger instance that is only available during data pipe runs
	 * @param pipe - data pipe configuration
	 * @param comment - the comment retrieved from Reddit
	 * @param toneAnalyzerQueue - queue for running Watson Tone Analyzer against comments
	 * @param loadMoreCommentsQueue - queue for loading more comments
	 * @param processReplies - a boolean value specifying whether or not to process replies
	 */
	var processComment = function(pushRecordFn, pipeRunLog, pipe, comment, toneAnalyzerQueue, loadMoreCommentsQueue, processReplies) {
		var replies = comment.replies;
		comment.replies = undefined; // null out replies
		comment.tree_path = commentTree.pushComment(comment).path;
		comment.tree_level = comment.tree_path.length;
		pipeRunLog.info('Processing Reddit comment ' + comment.name + ' with path ' + JSON.stringify(comment.tree_path));
		toneAnalyzerQueue.push(comment);
		if (processReplies) {
			processCommentReplies(pushRecordFn, pipeRunLog, pipe, replies, comment, toneAnalyzerQueue, loadMoreCommentsQueue);
		}
	}

	/**
	 * Process the replies to a comment.
	 * @param pushRecordFn - function to be invoked to push records through the pipeline
	 * @param pipeRunLog - a dedicated logger instance that is only available during data pipe runs
	 * @param pipe - data pipe configuration
	 * @param replies - the comment replies to process
	 * @param comment - the comment
	 * @param toneAnalyzerQueue - queue for running Watson Tone Analyzer against comments
	 * @param loadMoreCommentsQueue - queue for loading more comments
	 */
	var processCommentReplies = function(pushRecordFn, pipeRunLog, pipe, replies, comment, toneAnalyzerQueue, loadMoreCommentsQueue) {
		if (replies && replies.kind) {
			if (replies.kind == 'Listing') {
				if (replies.data && replies.data.children && replies.data.children.length > 0) {
					for (var i = 0; i < replies.data.children.length; i++) {
						var kind = replies.data.children[i].kind;
						if (kind == 't1') {
							processComment(pushRecordFn, pipeRunLog, pipe, replies.data.children[i].data, toneAnalyzerQueue, loadMoreCommentsQueue, true);
						}
						else if (kind == 'more') {
							// queue up loading of more comments
							// reddit API does not allow multiple calls to execture concurrently
							loadMoreCommentsQueue.push(replies.data.children[i].data);
						}
					}
				}
			}
			else if (replies.kind == 'more') {
				// queue up loading of more comments
				// reddit API does not allow multiple calls to execture concurrently
				loadMoreCommentsQueue.push(replies.data.children[i].data);
			}
		}
	}

	/**
	 *
	 * @param post
	 * @param callback
	 */
	var processWatsonToneAnalyzer = function(pushRecordFn, pipeRunLog, pipe, post, callback) {
		var msg = '';

		// Call Tone analyzer to get sentiments from the post
		// https://www.ibm.com/smarterplanet/us/en/ibmwatson/developercloud/doc/tone-analyzer/output.shtml
		pipeRunLog.info("Analyzing tone for object " + post.id);

		request.post(watsonToneAnalyzerService.credentials.url + '/v3/tone?version=2016-02-11', {
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
				pipeRunLog.error(msg);
				return callback( msg );
			}

			// pipeRunLog.debug('WTA response: ' + util.inspect(response));
			// pipeRunLog.debug('WTA body: ' + util.inspect(body));

			if(response.statusCode >= 300) {
				msg = 'Call to Watson Tone Analyzer URL ' + response.request.uri.href + ' returned status ' + response.statusCode + ' (' + response.body.error + ')';
				pipeRunLog.error(msg);
				pipeRunLog.error('FFDC - post: ' + util.inspect(post,5));
				return callback(msg);
			}

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

				// pipeRunLog.debug('Document tone categories: ' + util.inspect(body.document_tone.tone_categories));

				var generate_flat_document_structure = (pipe.outputFormat === 'JSON_flat');

				if(generate_flat_document_structure) {
					_.forEach(body.document_tone.tone_categories, function(tone_category) {
						_.forEach(tone_category.tones, function(tone){
							// Sample tone definition: { score: 0.10796, tone_id: 'anger', tone_name: 'Anger' }
							post[tone.tone_name.replace(/ /g,'_')] = (parseFloat(tone.score * 100)).toFixed(2);
						});
					});

				}
				else {
					_.forEach(body.document_tone.tone_categories, function(tone_category) {
						post[tone_category.category_id] = {
							category_name : tone_category.category_name,
							tones: tone_category.tones
						};
						// add normalized score (between 0 and 100, two decimal places)
						_.forEach(post[tone_category.category_id].tones, function(tone){
							// Sample tone definition: { score: 0.10796, tone_id: 'anger', tone_name: 'Anger' }
							tone.normalized_score = (parseFloat(tone.score * 100)).toFixed(2);
						});
					});

				}
			}
			else {
				// No tone analyzer results were returned
				// Don't store post in Cloudant
				pipeRunLog.warn('No Tone Analyzer results were returned for ' + post.id + '.');
			}

			// save in Cloudant
			pushRecordFn(post);

			return callback();

		}); // post
	}

} // function oAuthRedditConnector

/**
 * RedditCommentTree used to track the entire comment tree retrieved from Reddit.
 * @constructor
 */
function RedditCommentTree() {

	var articleName = null;
	this.nodes = new Array();

	this.pushArticle = function(article) {
		articleName = article.name;
		var path = [];
		var node = {
			name: article.name,
			body: article.body,
			path: path,
			children: []
		};
		this.nodes[article.name] = node;
		return node;
	}

	this.pushComment = function(comment) {
		var parent = this.nodes[comment.parent_id];
		var path = new Array();
		path.push(comment.parent_id);
		path = path.concat(parent.path);
		var node = {
			name: comment.name,
			body: comment.body,
			path: path,
			children: []
		};
		this.nodes[comment.name] = node;
		parent.children.push(node);
		return node;
	}

	this.print = function() {
		printNode(this.nodes[articleName]);
	}

	var printNode = function(node) {
		var prefix = '';
		for (var i=0; i<node.path.length; i++) {
			prefix += ' -';
		}
		var body = node.body;
		if (body) {
			if (body.length > 100) {
				body = body.substring(0, 100);
			}
			body = body.replace(/\n/g, ' ');
		}
		console.log(prefix + ' ' + node.name + ' ' + body);
		for (var i=0; i<node.children.length; i++) {
			printNode(node.children[i]);
		}
	}
}

//Extend event Emitter
util.inherits(oAuthRedditConnector, connectorExt);

module.exports = new oAuthRedditConnector();