# Simple Data Pipe Connector for Reddit

[Simple Data Pipe](https://developer.ibm.com/clouddataservices/simple-data-pipe/) connector for [Reddit Ask Me Anything](https://www.reddit.com/r/ama).

### Pre-requisites

##### Deploy the Simple Data Pipe

  [Deploy the Simple Data Pipe in Bluemix](https://github.com/ibm-cds-labs/simple-data-pipe) using the Deploy to Bluemix button or manually.

##### Services

This connector requires the [Watson Tone Analyzer service](https://console.ng.bluemix.net/catalog/services/tone-analyzer) in IBM Bluemix to be bound to the Simple Data Pipe application. 

Provision and bind a _Watson Tone Analyzer service_ instance using the Bluemix web console ([Show me how](https://github.com/ibm-cds-labs/simple-data-pipe/wiki/How-do-I-provision-and-bind-a-service-instance-in-Bluemix-using-the-Bluemix-web-console)) or run the following Cloud Foundry commands ([Show me how](https://github.com/ibm-cds-labs/simple-data-pipe/wiki/How-do-I-provision-and-bind-a-service-instance-in-Bluemix-using-the-Cloud-Foundry-command-line-client)):

````
  $ cf create-service tone_analyzer experimental "tone analyzer"
  $ cf bind-service simple-data-pipe "tone_analyzer"
  $ cf restage simple-data-pipe
````

> Pro Tip: If you want to re-use an existing instance that is not named `tone analyzer`, create a [USER-DEFINED Environment Variable](https://www.ng.bluemix.net/docs/manageapps/depapps.html#ud_env) in the Simple Data Pipe application named __WATSON_TONE_ANALYZER__ and set its value to the name of the existing Tone Analyzer service. [(Show me how - Bluemix)](https://github.com/ibm-cds-labs/simple-data-pipe/wiki/How-do-I-create-a-user-defined-environment-variable-in-Bluemix-using-the-Bluemix-web-console)
[(Show me how - Cloud Foundry client)](https://github.com/ibm-cds-labs/simple-data-pipe/wiki/How-Do-I--create-a-user-defined-environment-variable-in-Bluemix-using-the-Cloud-Foundry-command-line-client)

##### Install the Reddit connector

Install the connector using [these instructions](https://github.com/ibm-cds-labs/simple-data-pipe/wiki/Installing-a-Simple-Data-Pipe-Connector) into the Simple Data Pipe.  

### Using the Reddit Connector 
To configure and run a pipe

1. Open the Simple Data Pipe web console.
2. Select __Create A New Pipe__.
3. Select __Reddit AMA__ for the __Type__ when creating a new pipe  
4. In the Connect page, enter the __URL__ taken from the Reddit AMA URL, for example

  ```  
  https://www.reddit.com/r/IAmA/comments/3ilzey/were_a_bunch_of_developers_from_ibm_ask_us/
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
