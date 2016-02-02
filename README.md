# Simple Data Pipe Connector for Reddit

##### [Simple Data Pipe](https://developer.ibm.com/clouddataservices/simple-data-pipe/) connector for [Reddit AMA](https://www.reddit.com/r/ama)

This repository contains the Reddit AMA Simple Data Pipe connector. The connector should be used with latest version of the Simple Data Pipe implementing the [Simple Data Pipe SDK](https://github.com/ibm-cds-labs/simple-data-pipe-sdk).

### Pre-requisites

This connector requires the [Watson Tone Analyzer service](https://console.ng.bluemix.net/catalog/services/tone-analyzer) in IBM Bluemix to be bound to the Simple Data Pipe application. To find and use the Tone Analyzer service one of the following should be in place:

* Tone Analyzer service should be named __tone analyzer__

or

* Simple Data Pipe application should have a [USER-DEFINED Environment Variable](https://www.ng.bluemix.net/docs/manageapps/depapps.html#ud_env) with name __WATSON_TONE_ANALYZER__ and value set to the name of the Tone Analyzer service

### Using the Reddit AMA Connector 

* [Install the Connector](https://github.com/ibm-cds-labs/pipes/wiki/Installing-a-Simple-Data-Pipe-Connector) into Simple Data Pipe  
* Select __Reddit AMA__ for the __Type__ when creating a new pipe  
* In the Connect page, enter the __URL__ taken from the Reddit AMA URL (with _.json_ appended).  
  For example, with AMA  

  ```  
  https://www.reddit.com/r/IAmA/comments/3ilzey/were_a_bunch_of_developers_from_ibm_ask_us/
  ```  
  
  enter the URL as  
  
  ```  
  https://www.reddit.com/r/IAmA/comments/3ilzey/were_a_bunch_of_developers_from_ibm_ask_us.json
  ```  
  
  Notice the _.json_ appended at the end.

