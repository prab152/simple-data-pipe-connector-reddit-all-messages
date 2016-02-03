
var amaURL = 'https://www.reddit.com/r/IAmA/comments/43ooqf.json';
        var amaJsonURL = '';
        if(amaURL.charAt(amaURL.length-1) == '/') {
            amaJsonURL = amaURL.replace(/\/+$/,'.json');
        }
        else {
            amaJsonURL = amaURL + '.json';
        }

        console.log('Fetching URL: ' + amaJsonURL);

