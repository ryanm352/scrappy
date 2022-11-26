import puppeteer from 'puppeteer-extra';
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs/promises";
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
            console.log(`Error crawling ${data}: ${err.message}`);
        });

        await cluster.task(async ({ page, data: url }) => {

            page.on('response', async r => {
                // game summaries - scores, temperature
                if (r.url().includes('/stats/live/game-summaries')) {
                    try {
                        const json = await r.json();
                            //console.log(r.url());
                            console.log('FETCH: ' + r.url());
                            let urlParams = new URLSearchParams(new URL(r.url()).search);
                            //const season = urlParams.get('season');
                            //const seasonType = urlParams.get('seasonType');
                            //const week = urlParams.get('week');
                            //console.log(season + '_' + seasonType + '_' + week + '.json');
                            //let path = 'stats/' + season + '/game_summaries/';
                            this.gameData.push(json.data);
                            /*await fs.mkdir(path, { recursive: true }).catch(console.error).finally(() => {
                                fs.writeFile(path + season + '_' + seasonType + '_' + week + '.json', JSON.stringify(json.data));
                            });*/
                    }
                    catch (e) {
                        //console.log(e);
                    }
                }

                if (r.url().includes('/standings')) {
                    try {
                        const json = await r.json();
                        /*console.log('FETCH: ' + r.url());
                        console.log(json.weeks[0].standings.map(x => x.team));
                        console.log(json.weeks[0]);*/
                        //let filename = page.url().split('/').pop() ?? 'test.html';
                        //console.log(filename);
                     //   await fs.writeFile('standings.json', json);
                        const index = this.standings.findIndex(object => object.week === json.weeks.week);
                        if (index === -1) {
                            this.standings.push(json.weeks);
                        }
                        //console.log(json.weeks);
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
            });
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
//            await page.content();


            if (fetchAllGames) {
                if (!this.isListening) {
                    console.log('attaching to listen for more selectors');
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
        console.log(this.gameData);
        console.log(this.standings);
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
}