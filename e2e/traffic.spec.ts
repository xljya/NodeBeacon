import { test, expect } from "./fixtures";

const cycle = {
  source:"calibrated_estimate",status:"ok",unit:"GiB",mode:"sum",quota:500,
  periodStart:"2026-09-22T00:00:00Z",periodEnd:"2026-10-22T00:00:00Z",
  resetVerified:false,calibratedAt:"2026-10-02T14:00:00Z",updatedAt:"2026-10-02T14:01:00Z",
  tx:48.66,rx:47.83,used:96.49,remaining:403.51
};

for (const width of [1440,390]) {
  test(`calibrated traffic is clear at ${width}px in both themes and detail/table views`, async ({ page }, testInfo) => {
    const errors:string[]=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.setViewportSize({width,height:width===390?844:1000});
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.route("**/api/status",async route=>{
      const response=await route.fetch();
      const body=await response.json();
      body.nodes.find((n:{id:string})=>n.id==="dmit-uswest").traffic=cycle;
      await route.fulfill({response,json:body});
    });
    await page.goto("/");
    const summary=page.getByTestId("cycle-traffic");
    await expect(summary).toContainText("96.49 GiB / 500.00 GiB");
    await expect(summary).toContainText("403.51 GiB");
    await summary.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(summary).toContainText("2026-10-02 14:00 UTC");
    for(const appearance of ["Dark","Light","System"]) {
      await page.getByRole("button",{name:"Appearance"}).click();
      await page.getByRole("menuitem",{name:appearance,exact:true}).click();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await expect(summary).toBeVisible();
    }
    await page.screenshot({path:testInfo.outputPath(`traffic-${width}.png`),fullPage:true});
    await page.locator(".view-switch-button").nth(1).click();
    await expect(page.locator(".km-node-table")).toBeVisible();
    await expect(summary).toContainText("96.49 GiB");
    await page.goto("/nodes/dmit-uswest");
    await expect(summary).toContainText("Calibrated estimate");
    await expect(page.getByText(/Since boot:/)).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("expired or unavailable cycle never falls back to a misleading number",async({page})=>{
  for(const status of ["needs_calibration","unavailable"]) {
    await page.route("**/api/status",async route=>{
      const response=await route.fetch();const body=await response.json();
      body.nodes.find((n:{id:string})=>n.id==="dmit-uswest").traffic={...cycle,status,rx:null,tx:null,used:null,remaining:null};
      await route.fulfill({response,json:body});
    });
    await page.goto("/");
    const summary=page.getByTestId("cycle-traffic");
    await expect(summary).toBeVisible();
    await expect(summary).not.toContainText("GiB");
    await expect(summary).toContainText(status==="needs_calibration" ? "recalibration required" : "Estimate unavailable");
    await page.unroute("**/api/status");
  }
});

