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

var request = require("request");
var _ = require("lodash");
var async = require("async");
var pipesSDK = require.main.require('pipes-sdk');
var connectorExt = pipesSDK.connectorExt;
var bluemixHelperConfig = require.main.require('bluemix-helper-config');
var configManager = bluemixHelperConfig.configManager;
var vcapServices = bluemixHelperConfig.vcapServices;

var concurrency = 20;	//Async queue concurrency
/**
 * Pipes Connector for Reddit
 */
function redditConnector( parentDirPath ){
	//Call constructor from super class
	connectorExt.call(this, "reddit", "Reddit AMA", {
		copyToDashDb: false,
		extraRequiredFields: "amaURL",
		useOAuth: false,
		useCustomTables: true
	});
	
	this.getTablePrefix = function(){
		return "reddit";
	}
	
	this.getCloudantDbName = function(pipe, table){
		return pipe.name + "_" + table.name;
	}
	
	var watsonToneAnalyzerService = vcapServices.getService( configManager.get("WATSON_TONE_ANALYZER") || "tone analyzer" );
	
	this.fetchRecords = function( table, pushRecordFn, done, pipeRunStep, pipeRunStats, logger, pipe, pipeRunner ){
		if ( !watsonToneAnalyzerService ){
			var msg = "Unable to find Watson Tone Analyzer Service";
			console.log( msg );
			return done( msg );
		}
		if ( !pipe.amaURL ){
			return done("Missing field amaURL");
		}
		console.log("Connecting to AMA with url " + pipe.amaURL );
		request.get(pipe.amaURL, {"json": true},
			function( err, response, body ){
				if ( err ){
					console.log("Unable to fetch AMA: " + err );
					return done( err );
				}
				//console.log("response: " + body);
				//Create an async queue to process the record with Watson Tone Analyzer
				var q = async.queue( function( post, callback ){
					//Call Tone analyzer to get sentiments from the post
					request.post( watsonToneAnalyzerService.credentials.url + "/v1/tone",{
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
							console.log("Error accessing Watson Tone Analyzer");
							return callback( err );
						}
						var sentiments = {
						author: post.author,
						created: post.created_utc,
						edited: post.edited,
						id: post.id,
						num_comments: post.num_comments,
						title: post.title || "",
						text: post.selftext || post.body
                                                };
						
						if(body.children){
						_.forEach(body.children, function(child) {
							if(body.children){
							_.forEach(child.children, function(grandchild) {
								sentiments[grandchild.name] = parseFloat(grandchild.normalized_score * 100);
							});
						}

						});
                            pushRecordFn(sentiments); // push records only if tone analyzer returns data
                      }else{
                      	console.log("No record found"); //skip this record
                      }
			
   				return callback();
		        	
                                });
					
				}, concurrency );
				
				_.forEach( body, function( listing ){
					if ( listing.kind == "Listing" && listing.hasOwnProperty("data" ) ){
						if ( listing.data.hasOwnProperty("children") ){
							//Get the children from the data fields, only process the top posts for now
							_.forEach( listing.data.children, function( post ){
								if ( post.hasOwnProperty("data") ){
									q.push( post.data )
								}
							});
						}						
					}
				})
				
				//Add a drain function
				q.drain = function(){
					return done();
				}
			}
		);
	};
}

//Extend event Emitter
require('util').inherits(redditConnector, connectorExt);

module.exports = new redditConnector();
