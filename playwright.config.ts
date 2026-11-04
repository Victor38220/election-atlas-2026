import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',fullyParallel:true,timeout:45000,expect:{timeout:12000},retries:0,
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:process.env.PLAYWRIGHT_BASE_URL??'http://localhost:8787',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',viewport:{width:375,height:812}}}],
 webServer:process.env.PLAYWRIGHT_BASE_URL?undefined:{command:'npx wrangler dev --local --port 8787',url:'http://localhost:8787',reuseExistingServer:true,timeout:90000},
});
