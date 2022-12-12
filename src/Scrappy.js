import puppeteer from 'puppeteer-extra';
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import { executablePath } from "puppeteer";
import { Cluster } from "puppeteer-cluster";
import { Subject } from 'rxjs';

puppeteer.use(StealthPlugin());

export default class Scrappy {

    subject$ = new Subject();
    listener = null;
    isListening = false;
    gameData = [];
    standings = [];
    teams = [];


    async fetchGame(targetUrl, fetchAllGames = false) {
        if (!targetUrl) {
            console.error('No target Url provided!');
            return false;
        }

        console.log(String.fromCodePoint(0x1F575) + '  Launching Browser in stealth mode... target: ' + targetUrl);

        //initiate the browser if none given
        const cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_CONTEXT,
            maxConcurrency: 2,
            args: [
                "--no-sandbox",
                "--disable-gpu",
                "--disable-setuid-sandbox",
                "--disable-web-security",
            ],
            headless: true,
            ignoreHTTPSErrors: true,
            executablePath: executablePath(),
        });

        //create a new in headless chrome
        //const page = await browser.newPage();
        cluster.on("taskerror", (err, data) => {
            // add re-try data here
            console.log(`Error crawling ${data}: ${err.message}`);
        });

        await cluster.task(async ({ page, data: url }) => {

            page.on('response', async r => {
                // game summaries - scores, temperature
                if (r.url().includes('/stats/live/game-summaries')) {
                    try {
                        const json = await r.json();
                        console.log('FETCH: ' + r.url());
                        if (json.data.length > 0) {
                            json.data.forEach(game => {
                                let matches = this.gameData.games.find(existingGame => existingGame.gameId === game.gameId);
                                // Only add non-existing games to data
                                if (!matches) {
                                    this.gameData.games.push(game);
                                }
                            });
                            //console.log(this.gameData);
                        }
                    }
                    catch (e) {
                        //console.log(e);
                    }
                }

                // Used to get team names and standings
                if (r.url().includes('/standings')) {
                    try {
                        const json = await r.json();
                        const index = this.standings.findIndex(object => object.week === json.weeks.week);
                        if (json.weeks) {
                            if (index === -1) {
                                this.standings.push(json.weeks[0].standings);
                            }
                        }
                    }
                    catch (e) {
                        //console.log(e);
                    }
                }

                if (r.url().includes('/weeks/date')) {
                    try {
                        /* const json = await r.json();
                         console.log('FETCH: ' + r.url());
                         console.log(json.byeTeams.map(x => x));
                         console.log(json);*/

                    }
                    catch (e) {
                        //console.log(e);
                    }
                }

                if (r.url().includes('/venues')) {
                    try {
                        /* const json = await r.json();
                         console.log('FETCH: ' + r.url());
                         console.log(json.byeTeams.map(x => x));
                         console.log(json);*/

                    }
                    catch (e) {
                        //console.log(e);
                    }
                }

            });
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
//            await page.content();


            if (fetchAllGames) {
                if (!this.isListening) {
                    console.debug('DEBUG: Attaching to listen for more selectors');
                    await Promise.all([
                        page.waitForSelector('[data-test-id="facemask-row"]')
                    ]).then(() => console.log(String.fromCodePoint(0x2705) + ' Page loaded'));

                    await this.fetchAllGameUrls(page);
                }
            }
        });

        await cluster.queue(targetUrl);

        this.listener = this.subject$.subscribe((urls) => {
            urls.map((url) => cluster.queue(url));
            this.isListening = true;
        });

        await cluster.idle();
        await cluster.close();
        this.listener.unsubscribe();

        console.log('game data');
        this.gameData.teams = this.buildTeams();
        this.gameData.games = this.modifyGameData();
        //console.log(JSON.stringify(this.gameData));
        fs.writeFileSync('./data.json', JSON.stringify(this.gameData), 'utf-8');
        //fs.writeFileSync('./teams.json', JSON.stringify(this.teams), 'utf-8');
        //console.log(this.teams);
    }

    async fetchAllGameUrls(page) {

        let urls = [];

        const weeks = await page.evaluate(() =>
            Array.from(document.querySelectorAll('#Week option')).map(element => element.value)
        );

        // Option box format: YYYY-TTT-GGGG
        // int (4) YYYY = Year
        // char (3) TTT  =game type (PRE,REG)
        // int (2) GGGG = game week
        for (const w of weeks) {
            let [year, type, week] = w.split('-');
            urls.push(page.url() + year + '/' + type + week);
        }

        // push urls to observer
        this.subject$.next(urls);

        return urls;
    }

    modifyGameData() {
        return this.gameData.games.map(game => {
            this.gameData.teams.find(team => {
                if (team.teamId === game.awayTeam.teamId) {
                    game.awayTeam.name = team.name;
                    //game.awayTeam.stats = team.stats;
                }

                if (team.teamId === game.homeTeam.teamId) {
                    game.homeTeam.name = team.name;
                    //game.homeTeam.stats = team.stats;
                }
            });
            return game;
        });
    }

    buildTeams() {
        // get latest standing for current Week
        this.standings.slice(-1)[0].map(standing => {
            this.teams.push({
                teamId: standing.team.id,
                name: standing.team.fullName,
                stats: standing.overall
            });
        });
        return this.teams;
    }
}