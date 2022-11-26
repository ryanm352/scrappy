import Scrappy from "./src/Scrappy.js";


let scrappy = new Scrappy();
const scoresUrl = 'https://www.nfl.com/scores/';

scrappy.fetchGame(scoresUrl, true).catch().then();