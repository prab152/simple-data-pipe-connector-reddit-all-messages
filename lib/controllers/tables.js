function($scope, $http, $location, $state, $stateParams, pipesService) {
    $scope.tabName = $stateParams.tab;
    $scope.amaVerified = ($scope.selectedPipe.amaURL && $scope.selectedPipe.amaURL.length > 0);
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
    	ß.then( function(response){
            if(! $scope.selectedPipe.outputFormat) {
                $scope.selectedPipe.outputFormat = 'JSON_flat';
            }


            $scope.amaVerified = true;
            $scope.loadama = false;
            $('#WaitAMALoadBody').html("");
            //reload tab
            //$state.go($state.current, $stateParams, {reload: true});
        }, function(response){
            console.log('Error response: ' + JSON.stringify(response));
            if(response.status == -1) {
                $('#WaitAMALoadBody').html( "The provided URL not a valid Reddit AMA URL.");
            }
            else {
                $('#WaitAMALoadBody').html( "Error code: " + response.status + " (" + response.statusText + ")");
            }
            $scope.loadama = false;
        });
    }
}