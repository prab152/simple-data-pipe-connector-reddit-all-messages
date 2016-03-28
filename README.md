# Simple Data Pipe Connector for Reddit

[Simple Data Pipe](https://developer.ibm.com/clouddataservices/simple-data-pipe/) connector for [Reddit Ask Me Anything](https://www.reddit.com/r/ama). This connector fetches top level comments or all comments and replies for a post, uses the [Watson Tone Analyzer API](http://www.ibm.com/smarterplanet/us/en/ibmwatson/developercloud/tone-analyzer/api/v3/) to determine the sentiment and stores the results using the [Simple Data Pipe SDK](https://github.com/ibm-cds-labs/simple-data-pipe-sdk) in Cloudant. 

The data property for the selected post and each comment is retrieved and stored in Cloudant (See [https://www.reddit.com/dev/api](https://www.reddit.com/dev/api) for more information).
Since every comment in the comment tree is retrieved and stored individually the replies property for each document is not stored in Cloudant.
Two additional properties are added to each document:
 
1. tree_level: The level at which the article or comment appears in the tree.
2. tree_path: The path from the comment up to the article document (an array of ids starting with the comment's parent id and moving all the way up to the article id - the root of the tree).

#####Sample Record structure
```json
{
 "..." : "<cloudant document properties such as _id and _rev>",
 "subreddit_id": "t5_xxxxx",
 "banned_by": null,
 "removal_reason": null,
 "link_id": "t3_xxxxxx",
 "likes": null,
 "user_reports": [],
 "saved": false,
 "id": "xxxxxxx",
 "gilded": 0,
 "archived": false,
 "report_reasons": null,
 "author": "<author>",
 "parent_id": "t3_xxxxxx",
 "score": 1,
 "approved_by": null,
 "controversiality": 0,
 "body": "Do you guys need any software engineers? ",
 "edited": false,
 "author_flair_css_class": null,
 "downs": 0,
 "body_html": "&lt;div class=\"md\"&gt;&lt;p&gt;Do you guys need any software engineers? &lt;/p&gt;\n&lt;/div&gt;",
 "stickied": false,
 "subreddit": "IAmA",
 "score_hidden": false,
 "name": "t1_xxxxxxx",
 "created": 1458803108,
 "author_flair_text": null,
 "created_utc": 1458774308,
 "ups": 1,
 "mod_reports": [],
 "num_reports": null,
 "distinguished": null,
 "tree_path": [
  "t1_xxxxxx",
  "t1_xxxxxx",
  "t3_xxxxxx"
 ],
 "tree_level": 3,
 "pt_type": "<subreddit_id>"		 		 
}
```

Need to load data from other sources? Check out the [connector repository](https://developer.ibm.com/clouddataservices/simple-data-pipe-connectors/).

### Pre-requisites

##### General 
 A valid reddit user id is required to use this connector.

##### Deploy the Simple Data Pipe

  [Deploy the Simple Data Pipe in Bluemix](https://github.com/ibm-cds-labs/simple-data-pipe) using the Deploy to Bluemix button or manually.

##### Services

This connector requires the [Watson Tone Analyzer service](https://console.ng.bluemix.net/catalog/services/tone-analyzer) in IBM Bluemix to be bound to the Simple Data Pipe application. 

[Provision and bind](https://github.com/ibm-cds-labs/simple-data-pipe/wiki/Provision-and-bind-a-service-instance-in-Bluemix) a _Watson Tone Analyzer service_ instance. If you're using Cloud Foundry, do so by running the following commands:

````
  $ cf create-service tone_analyzer beta "tone analyzer"
  $ cf bind-service simple-data-pipe "tone analyzer"
  $ cf restage simple-data-pipe
````

> Pro Tip: If you want to re-use an existing instance that is not named `tone analyzer`, create a [USER-DEFINED Environment Variable](https://www.ng.bluemix.net/docs/manageapps/depapps.html#ud_env) in the Simple Data Pipe application named __WATSON_TONE_ANALYZER__ and set its value to the name of the existing Tone Analyzer service. [Read how](https://github.com/ibm-cds-labs/simple-data-pipe/wiki/Create-a-user-defined-environment-variable-in-Bluemix).


##### Install the Reddit connector

  When you [follow these steps to install this connector](https://github.com/ibm-cds-labs/simple-data-pipe/wiki/Installing-a-Simple-Data-Pipe-Connector), add the following line to the dependencies list in the package.json file: 
  
  ````
  "simple-data-pipe-connector-reddit-all-messages": "^0.1.2",
  ````

##### Enable OAuth support and collect connectivity information

 You need to register the Simple Data Pipe application with Reddit before you can use it to load data.
 1. Open the [reddit](http://www.reddit.com) web page and log in.
 2. Click **Preferences** and select the **apps** tab.
 3. **Create another app...**
 4. Assign an application **name** and enter an optional **description**.
 5. As _redirect URL_ enter `https://<simple-data-...mybluemix.net>/authCallback`.
   > Replace `<simple-data-...mybluemix.net>` with the fully qualified host name of your Simple Data Pipe application on Bluemix.
 6. Click **create app**.
 7. Copy the application id displayed under your application name (e.g. vv5ulJR3...20Q) and the secret (e.g. j60....CFSyAmSY).


### Using the Reddit Connector 
To configure and run a pipe:

1. Open the Simple Data Pipe web console.
2. Select __Create A New Pipe__.
3. Select __Reddit AMA - All Messages__ for the __Type__ when creating a new pipe. 
4. In the _Connect_ page, enter the _application id_ and _secret_ from the reddit app preferences page.
5. In the _Filter Data_ page, enter the __URL__ taken from the Reddit AMA URL, for example

  ```  
  https://www.reddit.com/r/IAmA/comments/3ilzey/were_a_bunch_of_developers_from_ibm_ask_us/
  ```  
6. Choose the desired output format (the properties listed below will be added to each document stored in Cloudant). 

 ###### JSON 

 ```JSON
{
  "..." : "...",
  "emotion_tone": {
    "category_name": "Emotion Tone",
    "tones": [
      {
        "score": 0.045,
        "tone_id": "anger",
        "tone_name": "Anger",
        "normalized_score": "4.5"
      },
      { "..." : "..."} 
    ]
  },
  "writing_tone": {
    "category_name": "Writing Tone",
    "tones": [
      {
        "score": 0.7810,
        "tone_id": "analytical",
        "tone_name": "Analytical",
        "normalized_score": "78.10"
      },
      { "..." : "..."} 
    ]
  },
  "social_tone": {
    "category_name": "Social Tone",
    "tones": [
      {
        "score": 0.0330,
        "tone_id": "openness_big5",
        "tone_name": "Openness",
        "normalized_score": "3.30"
      },
      { "..." : "..."} ,
    ]
  },
  "..." : "..."
}
```

 ###### JSON flattened (a condensed version that does not contain nested properties)

 ```JSON
{
  "..." : "...",
  "Anger": "4.50",
  "Disgust": "18.22",
  "Fear": "31.70",
  "Joy": "30.16",
  "Sadness": "15.42",
  "Analytical": "78.10",
  "Confident": "96.40",
  "Tentative": "74.50",
  "Openness": "3.30",
  "Conscientiousness": "2.00",
  "Extraversion": "81.00",
  "Agreeableness": "69.40",
  "Emotional_Range": "97.60",
  "..." : "..."
}
```



#### License 

Copyright [2015-2016] IBM Cloud Data Services

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
