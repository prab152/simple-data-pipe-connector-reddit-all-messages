# Simple Data Pipe Connector for Reddit

[Simple Data Pipe](https://developer.ibm.com/clouddataservices/simple-data-pipe/) connector for [Reddit Ask Me Anything](https://www.reddit.com/r/ama). This connector fetches a limited number of Reddit comments for a post, uses the [Watson Tone Analyzer API](http://www.ibm.com/smarterplanet/us/en/ibmwatson/developercloud/tone-analyzer/api/v3/) to determine the sentiment and stores the results using the [Simple Data Pipe SDK](https://github.com/ibm-cds-labs/simple-data-pipe-sdk) in Cloudant. 

Need to load data from other sources? Check out the [connector repository](https://developer.ibm.com/clouddataservices/simple-data-pipe-connectors/).

### Pre-requisites

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

  When you [follow these steps to install this connector](https://github.com/ibm-cds-labs/simple-data-pipe/wiki/Installing-a-Simple-Data-Pipe-Connector), add the following line to the dependencies list in the package.json file: `"simple-data-pipe-connector-reddit": "^0.1.1"`

### Using the Reddit Connector 
To configure and run a pipe

1. Open the Simple Data Pipe web console.
2. Select __Create A New Pipe__.
3. Select __Reddit AMA__ for the __Type__ when creating a new pipe  
4. In the Connect page, enter the __URL__ taken from the Reddit AMA URL, for example

  ```  
  https://www.reddit.com/r/IAmA/comments/3ilzey/were_a_bunch_of_developers_from_ibm_ask_us/
  ```  
5. Choose the desired output format. 

 ###### JSON 

 ```JSON
{
  "..." : "...",
  "text": "For someone wanting to enter the tech world such as myself, what do you recommend to a college freshman? I'm thinking web development, but I'm not too sure. What's your advice?",
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
  "text": "For someone wanting to enter the tech world such as myself, what do you recommend to a college freshman? I'm thinking web development, but I'm not too sure. What's your advice?",
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
