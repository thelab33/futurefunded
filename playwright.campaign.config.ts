import {defineConfig} from "@playwright/test";
export default defineConfig({
 testDir:"./tests/e2e", testMatch:"campaign-migration.spec.ts", fullyParallel:false,
 forbidOnly:Boolean(process.env.CI), retries:0, workers:1, reporter:"list", timeout:30000,
 use:{baseURL:process.env.FF_CAMPAIGN_BASE_URL ?? "http://127.0.0.1:3355",browserName:"chromium",headless:true,
   storageState:{cookies:[],origins:[]},trace:"off",screenshot:"off",video:"off",
   ...(process.env.FF_CAMPAIGN_BROWSER ? {launchOptions:{executablePath:process.env.FF_CAMPAIGN_BROWSER,args:["--no-sandbox","--disable-dev-shm-usage"]}} : {}),
 },
});
