let streetView;
let map;
let panorama;
let currentRound = 1;
let totalScore = 0;
let actualLocation;
let guessMarker;
let retryCount = 0;
let guessLine = null;
let isRoundComplete = false;
const MAX_RETRIES = 3;

// Define regions of interest (continents and major areas)
const regions = [
    { name: 'North America', bounds: { north: 60, south: 25, east: -60, west: -130 } },
    { name: 'South America', bounds: { north: 10, south: -55, east: -30, west: -80 } },
    { name: 'Europe', bounds: { north: 70, south: 35, east: 40, west: -10 } },
    { name: 'Africa', bounds: { north: 35, south: -35, east: 50, west: -20 } },
    { name: 'Asia', bounds: { north: 60, south: 10, east: 150, west: 60 } },
    { name: 'Oceania', bounds: { north: -10, south: -45, east: 180, west: 110 } }
];

function getRandomLocationInRegion(region) {
    const lat = Math.random() * (region.bounds.north - region.bounds.south) + region.bounds.south;
    const lng = Math.random() * (region.bounds.east - region.bounds.west) + region.bounds.west;
    return { lat, lng };
}

function findValidStreetViewLocation() {
    return new Promise((resolve, reject) => {
        const streetViewService = new google.maps.StreetViewService();
        let attempts = 0;
        const maxAttempts = 20; // Increased from 10 to 20 attempts

        function tryLocation() {
            if (attempts >= maxAttempts) {
                reject('Could not find valid Street View location after ' + maxAttempts + ' attempts');
                return;
            }

            // Pick a random region
            const region = regions[Math.floor(Math.random() * regions.length)];
            const location = getRandomLocationInRegion(region);

            streetViewService.getPanorama({
                location: location,
                radius: 2000 // Increased from 1000 to 2000 meters
            }, function(data, status) {
                if (status === 'OK') {
                    resolve(data.location.latLng);
                } else {
                    attempts++;
                    tryLocation();
                }
            });
        }

        tryLocation();
    });
}

// Initialize the game
function initGame() {
    console.log('Initializing game...');
    
    try {
        // Initialize Street View
        panorama = new google.maps.StreetViewPanorama(
            document.getElementById('street-view'),
            {
                enableCloseButton: false,
                addressControl: false,
                showRoadLabels: false,
                zoomControl: true,
                motionTracking: false,
                motionTrackingControl: false,
                fullscreenControl: false,
                panControl: true
            }
        );

        // Add error handling for Street View
        panorama.addListener('status_changed', function() {
            const status = panorama.getStatus();
            console.log('Street View Status:', status);
            if (status !== 'OK') {
                console.error('Street View Error:', status);
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    setTimeout(startNewRound, 1000);
                } else {
                    alert('Error loading Street View. Please refresh the page and try again.');
                }
            } else {
                retryCount = 0;
            }
        });

        // Add heading change listener for compass
        panorama.addListener('pov_changed', function() {
            updateCompass(panorama.getPov().heading);
        });

        // Initialize Map
        map = new google.maps.Map(document.getElementById('map'), {
            zoom: 2,
            center: { lat: 0, lng: 0 },
            mapTypeId: 'roadmap',
            streetViewControl: false,
            fullscreenControl: false
        });

        // Add click listener to map for making guesses
        map.addListener('click', function(event) {
            if (guessMarker) {
                guessMarker.setMap(null);
            }
            guessMarker = new google.maps.Marker({
                position: event.latLng,
                map: map,
                title: 'Your Guess'
            });
        });

        startNewRound();

        console.log('Game initialization complete');
        hideLoading(); // Hide the loading box when game is ready
    } catch (error) {
        console.error('Error initializing game:', error);
        alert('Error initializing game: ' + error.message);
    }
}

function startNewRound() {
    if (currentRound > 5) {
        endGame();
        return;
    }

    // Hide round results display
    document.getElementById('round-results').style.display = 'none';
    
    // Find a valid Street View location
    findValidStreetViewLocation()
        .then(location => {
            actualLocation = location;
            panorama.setPosition(actualLocation);
            panorama.setPov({ heading: Math.random() * 360, pitch: 0 });
        })
        .catch(error => {
            console.error('Error finding location:', error);
            // If we can't find a location, try again
            startNewRound();
        });

    document.getElementById('round-info').textContent = `Round: ${currentRound}/5`;
    if (guessMarker) {
        guessMarker.setMap(null);
        guessMarker = null;
    }
    // Remove previous actual location marker if any
    if (window.actualLocationMarker) {
        window.actualLocationMarker.setMap(null);
        window.actualLocationMarker = null;
    }
    // Remove previous line if any
    if (guessLine) {
        guessLine.setMap(null);
        guessLine = null;
    }
    // Reset map to default zoom and center
    map.setZoom(2);
    map.setCenter({ lat: 0, lng: 0 });
}

function calculateScore(guessLatLng) {
    const distance = google.maps.geometry.spherical.computeDistanceBetween(
        actualLocation,
        guessLatLng
    );
    
    // Convert distance to kilometers
    const distanceKm = distance / 1000;
    
    // GeoGuessr's exact scoring formula:
    // - 5000 points for distances < 150m
    // - For distances >= 150m: 5000 * e^(-distance/2000)
    let score;
    if (distanceKm < 0.15) { // 150 meters
        score = 5000;
    } else {
        score = Math.round(5000 * Math.pow(Math.E, -distanceKm/2000));
    }
    
    return score;
}

function submitGuess() {
    if (!guessMarker) {
        alert('Please make a guess on the map first!');
        return;
    }
    const guessLatLng = guessMarker.getPosition();
    const distance = google.maps.geometry.spherical.computeDistanceBetween(
        actualLocation,
        guessLatLng
    );
    const roundScore = calculateScore(guessLatLng);
    totalScore += roundScore;
    document.getElementById('score-display').textContent = `Score: ${totalScore}`;
    
    // Show actual location on map with black circle
    window.actualLocationMarker = new google.maps.Marker({
        position: actualLocation,
        map: map,
        title: 'Actual Location',
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#000000',
            fillOpacity: 1,
            strokeColor: '#000000',
            strokeWeight: 2
        }
    });

    // Draw line between guess and actual location
    guessLine = new google.maps.Polyline({
        path: [guessLatLng, actualLocation],
        geodesic: false,
        strokeColor: '#000000',
        strokeOpacity: 1.0,
        strokeWeight: 2
    });
    guessLine.setMap(map);

    // Calculate bounds to fit both markers
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(guessLatLng);
    bounds.extend(actualLocation);
    
    // Add padding to the bounds
    const padding = {
        top: 50,
        right: 50,
        bottom: 50,
        left: 50
    };
    
    // Fit map to bounds with padding
    map.fitBounds(bounds, padding);

    // Display distance and points
    const distanceKm = Math.round(distance / 1000);
    const roundResults = document.getElementById('round-results');
    roundResults.style.display = 'block';
    roundResults.innerHTML = `
        <div class="distance">Distance: ${distanceKm} km</div>
        <div class="points">Points: ${roundScore}</div>
        <div class="continue">Press SPACE to continue</div>
    `;

    isRoundComplete = true;
}

function endGame() {
    document.getElementById('final-score').textContent = totalScore;
    document.getElementById('game-over').style.display = 'block';
}

function startNewGame() {
    currentRound = 1;
    totalScore = 0;
    document.getElementById('score-display').textContent = 'Score: 0';
    document.getElementById('game-over').style.display = 'none';
    if (guessMarker) {
        guessMarker.setMap(null);
        guessMarker = null;
    }
    if (window.actualLocationMarker) {
        window.actualLocationMarker.setMap(null);
        window.actualLocationMarker = null;
    }
    startNewRound();
}

// Add space key event listener
document.addEventListener('keydown', function(event) {
    if (event.code === 'Space') {
        event.preventDefault(); // Prevent page scroll
        if (isRoundComplete) {
            currentRound++;
            isRoundComplete = false;
            startNewRound();
        } else if (guessMarker) {
            submitGuess();
        }
    }
});

// Add compass update function
function updateCompass(heading) {
    const compassNeedle = document.getElementById('compass-needle');
    compassNeedle.style.transform = `translate(-50%, -50%) rotate(${-heading}deg)`;
} 