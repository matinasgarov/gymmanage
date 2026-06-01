import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:3000/forgot-password");
await p.fill('input[name="email"]', "matinasgarov21@gmail.com");
await p.click('button[type="submit"]');
await p.waitForSelector("text=sıfırlama linki göndərildi", { timeout: 15000 });
console.log("forgot-password submitted for owner");
await b.close();
