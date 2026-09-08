import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const env = readFileSync(".env", "utf8");
const secret = env.match(/^PREVIEW_PASSWORD="?([^"\r\n]+)"?/m)?.[1];
const browser = await chromium.launch();
const context = await browser.newContext({ httpCredentials: secret ? { username: "aussiemed", password: secret } : undefined, viewport: {width:1440,height:1000} });
const page = await context.newPage();
const failures = [];
page.on("pageerror", error => failures.push(String(error).slice(0,500)));
async function visit(path) {
 const response=await page.goto("http://localhost:3000"+path,{waitUntil:"networkidle"});
 if (response.status()>=400) failures.push(path+": "+response.status());
 const broken=await page.locator("img").evaluateAll(images=>images.filter(i=>i.complete&&!i.naturalWidth).map(i=>i.getAttribute("src")));
 if(broken.length) failures.push(path+" broken images: "+broken.join(","));
 console.log(path, response.status(), "images", await page.locator("img").count());
}
try {
 await visit("/admin");
 if(await page.getByLabel("Username or email").count()) {
  await page.getByLabel("Username or email").fill("admin");
  await page.getByLabel("Password",{exact:true}).fill("AussieMed2026!");
  const auth = page.waitForResponse(r=>r.url().includes("/api/v1/auth")&&r.request().method()==="POST");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();await auth;
 }
 await visit("/admin/orders");
 mkdirSync(".qa",{recursive:true});await page.screenshot({path:".qa/orders-by-client.png",fullPage:true});
 const clientLink = page.locator('a[href^="/admin/orders?client="]').first();
 const clientHref=await clientLink.getAttribute("href");if(!clientHref)throw Error("No client groups rendered");
 await visit(clientHref);
 const orderHref=await page.locator('a[href^="/admin/orders/AM-"]').first().getAttribute("href");
 if(orderHref){ await visit(orderHref);console.log("Order thumbnails", await page.locator('img[src^="/api/product-thumbnail"]').count()); await page.screenshot({path:".qa/order-detail.png",fullPage:true}); await visit(orderHref+"/tax-invoice");await page.screenshot({path:".qa/invoice.png",fullPage:true}); }
 await visit("/admin/bulk-buy");
 await visit("/admin/received-products");
 await visit("/admin/purchasing/backorders");
 await visit("/admin/products");
 const productHref=await page.locator('tbody a[href^="/admin/products/"]').first().getAttribute("href");
 if(productHref)await visit(productHref);
 await visit("/admin/suppliers");
 const supplierHref=await page.locator('a[href^="/admin/suppliers/"]').filter({hasNotText:/Daily|Cover|Prices/}).last().getAttribute("href");
 if(supplierHref)await visit(supplierHref);
 console.log("FAILURES",JSON.stringify(failures));
 if(failures.length)process.exitCode=1;
} finally {await browser.close();}
