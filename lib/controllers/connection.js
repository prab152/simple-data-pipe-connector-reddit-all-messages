function($scope, $http, $location, $state, $stateParams, pipesService) {
    $scope.tabName = $stateParams.tab;
    $scope.loadAMA = function(){

        $scope.amaJsonURL = '';
        if($scope.selectedPipe.amaURL.match(/\.json$/)) {
            $scope.amaJsonURL = $scope.selectedPipe.amaURL;
        }
        else {
            if($scope.selectedPipe.amaURL.charAt($scope.selectedPipe.amaURL.length-1) == '/') {
                $scope.amaJsonURL = $scope.selectedPipe.amaURL.replace(/\/+$/,'.json');
            }
            else {
                $scope.amaJsonURL = $scope.selectedPipe.amaURL + '.json';
            }
        }

        console.log('Fetching URL: ' + $scope.amaJsonURL);

    	$http.get($scope.amaJsonURL)
    	.then( function(response){
//    		      $('#WaitAMALoad').modal('hide');
    		      $scope.selectedPipe.tables=[
    		          {name:"All Posts"}, 
    		          {name: "Top Posts Only"}
    		      ];
    		      //reload tab
    		      $state.go($state.current, $stateParams, {reload: true});
    	       },
    	       function(response){
                    console.log('Error response: ' + JSON.stringify(response));
                    if(response.status == -1) {
                            $('#WaitAMALoadBody').html( "The provided URL not a valid Reddit AMA URL.");     
                    }
                    else {
                        $('#WaitAMALoadBody').html( "Error code: " + response.status + " (" + response.statusText + ")");
                    }
    		
    	   });
    }
}