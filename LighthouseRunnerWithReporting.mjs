import { launch } from 'chrome-launcher';
import fs from 'fs';
import csv from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import fetch from 'node-fetch';
import puppeteer from 'puppeteer';
import lighthouse from 'lighthouse';
import path from 'path';
 
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const inputCsv = 'Crawler.csv';
const outputCsv = 'LighthouseResults.csv';
const urls = [];
const reportDir = 'lighthouse-reports';
 
// Ensure the reports directory exists
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir);
}
 
// Read URLs from the input CSV
fs.createReadStream(inputCsv)
  .pipe(csv())
  .on('data', (row) => {
    if (row.URL) {
      urls.push(row.URL);
    }
  })
  .on('end', async () => {
    console.log('CSV file successfully processed');
    
    let cookies = '';
    if (config.authType === 'page') {
      cookies = await pageAuth();
    }
 
    const results = [];
    for (const url of urls) {
      try {
        const { scores, reportPath } = await runLighthouseWithAuth(url, cookies);
        const fullReportPath = path.resolve(reportPath);
        results.push({ Timestamp: new Date().toISOString(), URL: `=HYPERLINK("${url}", "${url}")`, ...scores, Report: `=HYPERLINK("${fullReportPath}", "${fullReportPath}")` });
        console.log(`Processed URL: ${url}, Scores: ${JSON.stringify(scores)}, Report: ${fullReportPath}`);
      } catch (error) {
        console.error(`Error processing URL: ${url}, Error: ${error.message}`);
        results.push({ Timestamp: new Date().toISOString(), URL: `=HYPERLINK("${url}", "${url}")`, Performance: 'Error', Accessibility: 'Error', BestPractices: 'Error', SEO: 'Error', Report: 'Error' });
      }
    }
 
    // Write results to the output CSV
    const csvWriter = createObjectCsvWriter({
      path: outputCsv,
      header: [
        { id: 'Timestamp', title: 'Timestamp' },
        { id: 'URL', title: 'URL' },
        { id: 'Performance', title: 'Performance' },
        { id: 'Accessibility', title: 'Accessibility' },
        { id: 'BestPractices', title: 'Best Practices' },
        { id: 'SEO', title: 'SEO' },
        { id: 'Report', title: 'Report' },
      ],
    });
 
    await csvWriter.writeRecords(results);
    console.log('Results written to CSV file');
  });
 
// Function to run Lighthouse with authentication
async function runLighthouseWithAuth(url, cookies = '') {
  if (config.authType === 'basic') {
    await basicAuth(url);
  } else if (config.authType === 'digest') {
    await digestAuth(url);
  }
  return await runLighthouse(url, cookies);
}
 
// Function for Basic Authentication
async function basicAuth(url) {
  const base64Credentials = Buffer.from(`${config.basicAuth.username}:${config.basicAuth.password}`).toString('base64');
  const response = await fetch(url, { headers: { 'Authorization': `Basic ${base64Credentials}` } });
  if (!response.ok) {
    throw new Error('Basic Authentication failed');
  }
}
 
// Function for Digest Authentication
async function digestAuth(url) {
  // Implement digest authentication if needed
  // Placeholder for digest authentication logic
  throw new Error('Digest Authentication not implemented');
}
 
// Function for Page Login Authentication
async function pageAuth() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  try {
    console.log('Navigating to login page...');
    await page.goto(config.pageAuth.loginUrl, { waitUntil: 'networkidle2', timeout: 90000 });
    console.log('Waiting for username field...');
    await page.waitForSelector(config.pageAuth.usernameField, { timeout: 30000 });
    await page.type(config.pageAuth.usernameField, config.pageAuth.username);
    console.log('Entered username');
    console.log('Waiting for password field...');
    await page.waitForSelector(config.pageAuth.passwordField, { timeout: 30000 });
    await page.type(config.pageAuth.passwordField, config.pageAuth.password);
    console.log('Entered password');
    console.log('Waiting for submit button...');
    await page.waitForSelector(config.pageAuth.submitField, { timeout: 30000 });
await page.click(config.pageAuth.submitField);
    console.log('Submitted login form');
    console.log('Waiting for navigation after login...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 90000 });
    console.log('Login successful, waiting for navigation');
    const cookies = await page.cookies();
const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    await page.close();
    await browser.close();
    return cookieString;
  } catch (error) {
    console.error(`Page login failed: ${error.message}`);
    await browser.close();
    throw error;
  }
}
 
// Function to run Lighthouse and get the performance score
async function runLighthouse(url, cookies = '') {
  console.log(`Running Lighthouse for URL: ${url}`);
  const chrome = await launch({ chromeFlags: ['--headless'] });
  const { port } = chrome;
  const options = {
    logLevel: 'info',
    output: 'html', // Change to 'html' to get the HTML report
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    port,
    extraHeaders: cookies ? { 'Cookie': cookies } : undefined
  };
 
  let runnerResult;
  try {
    runnerResult = await lighthouse(url, options);
  } catch (error) {
    console.error(`Lighthouse error for URL: ${url}, Error: ${error.message}`);
    await chrome.kill();
    throw error;
  }
 
const reportHtml = runnerResult.report;
  const reportPath = path.join(reportDir, `${new Date().toISOString().replace(/:/g, '-')}_${encodeURIComponent(url.replace(/https?:\/\//, '')).replace(/[\/\\?%*:|"<>]/g, '-')}.html`);
  fs.writeFileSync(reportPath, reportHtml);
 
  const { performance, accessibility, 'best-practices': bestPractices, seo } = runnerResult.lhr.categories;
  const scores = {
    Performance: performance.score * 100,
    Accessibility: accessibility.score * 100,
    BestPractices: bestPractices.score * 100,
    SEO: seo.score * 100,
  };
 
  await chrome.kill();
  return { scores, reportPath };
}