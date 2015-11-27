function($scope, $http, $location, $stateParams, pipesService) {
    $scope.tabName = $stateParams.tab;
    $scope.loadAMA = function(){
    	$http.get($scope.selectedPipe.amaURL)
    	.success( function(response){
    		$('#WaitAMALoad').modal('hide');
    		$scope.selectedPipe.tables=[
    		   {name:"All Posts"}, 
    		   {name: "Top Posts Only"}
    		];
    	})
    	.error( function( data, status, headers, config){
    		$('#WaitAMALoadBody').html( "error: " + data + " Status: " + status);
    	})
    }
}