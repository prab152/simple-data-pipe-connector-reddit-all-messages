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

    	$http.get(amaJsonURL)
    	.success( function(response){
    		$('#WaitAMALoad').modal('hide');
    		$scope.selectedPipe.tables=[
    		   {name:"All Posts"}, 
    		   {name: "Top Posts Only"}
    		];
    		//reload tab
    		$state.go($state.current, $stateParams, {reload: true});
    	})
    	.error( function( response){
            console.log('URL' + amaJsonURL);
            console.log('Reponse: ' + JSON.stringify(response));
    		$('#WaitAMALoadBody').html( "error: " + response.statusText + " Status: " + response.status);
    	})
    }
}