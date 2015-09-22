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

var connectorExt = require("../connectorExt");

/**
 * Sample connector using a few JSON records
 */
function demoConnector( parentDirPath ){
	//Call constructor from super class
	connectorExt.call(this, "reddit", "AMA IBM Reddit");
	
	this.getTablePrefix = function(){
		return "reddit";
	}
	
	this.fetchRecords = function( table, pushRecordFn, done, pipeRunStep, pipeRunStats, logger, pipe, pipeRunner ){
		request.get("https://www.reddit.com/r/IAmA/comments/3ilzey/were_a_bunch_of_developers_from_ibm_ask_us.json", {"json": true},
			function( err, response, body ){
				if ( err ){
					console.log("Unable to fetch AMA: " + err );
					return done( err );
				}
				console.log("response: " + body);
				_.forEach( body, function( listing ){
					if ( listing.kind == "Listing" && listing.hasOwnProperty("data" ) ){
						if ( listing.data.hasOwnProperty("children") ){
							//Get the children from the data fields, only process the top posts for now
							_.forEach( listing.data.children, function( post ){
								if ( post.hasOwnProperty("data") ){
									pushRecordFn({
										author: post.data.author,
										created: post.data.created_utc,
										edited: post.data.edited,
										id: post.data.id,
										num_comments: post.data.num_comments,
										title: post.data.title || "",
										body: post.data.selftext || post.data.body
									});
								}
							});
						}						
					}
				})
				return done();
			}
		);
	};
}

//Extend event Emitter
require('util').inherits(demoConnector, connectorExt);

module.exports = new demoConnector();