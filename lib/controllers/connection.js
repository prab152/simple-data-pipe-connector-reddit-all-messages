function($scope, $http, $location, $state, $stateParams, pipesService) {
    $scope.tabName = $stateParams.tab;
    $scope.loadAMA = function(){

        var amaJsonURL = '';
        if($scope.selectedPipe.amaURL.charAt($scope.selectedPipe.amaURL.length-1) == '/') {
            amaJsonURL = $scope.selectedPipe.amaURL.replace(/\/+$/,'.json');
        }
        else {
            amaJsonURL = $scope.selectedPipe.amaURL + '.json';
        }

        console.log('Fetching URL: ' + amaJsonURL);

    	$http.get(amaJsonURL)
    	.then( function(response){
    		      $('#WaitAMALoad').modal('hide');
    		      $scope.selectedPipe.tables=[
    		          {name:"All Posts"}, 
    		          {name: "Top Posts Only"}
    		      ];
    		      //reload tab
    		      $state.go($state.current, $stateParams, {reload: true});
    	       },
    	       function(response){
                    console.log('Error response: ' + JSON.stringify(response));
                    if((! response.statusText) || (! response.status)) {
                        $('#WaitAMALoadBody').html( "Error: " + response.error);    
                    }
                    else {
                        $('#WaitAMALoadBody').html( "Error: " + response.statusText + " Status: " + response.status);
                    }
    		
    	   });
    }
}