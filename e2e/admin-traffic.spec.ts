import { test, expect } from "./fixtures";

test("owner can enable, validate and remove calibration from the mobile editor",async({ownerPage:page})=>{
  await page.setViewportSize({width:390,height:844});
  const path="/api/admin/nodes/e2e-traffic";
  expect((await page.request.post("/api/admin/nodes",{data:{id:"e2e-traffic",name:"Traffic editor test",provider:"test",group:"test",region:"test",public:false,labels:{job:"test"}}})).status()).toBe(200);
  try {
    await page.goto("/admin/servers");
    await page.getByRole("row").filter({hasText:"Traffic editor test"}).getByRole("button",{name:"Edit information"}).click();
    await page.getByText("Configure cycle traffic",{exact:true}).click();
    await page.getByRole("button",{name:"Save",exact:true}).click();
    await expect(page.getByRole("alert")).toContainText("Invalid traffic calibration");
    await page.getByLabel("Cycle allowance",{exact:true}).fill("500");
    await page.getByLabel("Upload (GiB)",{exact:true}).fill("48.76");
    await page.getByLabel("Download (GiB)",{exact:true}).fill("47.92");
    await page.getByRole("button",{name:"Save",exact:true}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const saved=(await (await page.request.get("/api/admin/nodes")).json()).nodes.find((n:{id:string})=>n.id==="e2e-traffic");
    expect(saved.traffic).toMatchObject({quota:500,unit:"GiB",calibration:{tx:48.76,rx:47.92}});
    await page.getByRole("row").filter({hasText:"Traffic editor test"}).getByRole("button",{name:"Edit information"}).click();
    await page.getByText("Configure cycle traffic",{exact:true}).click();
    await page.getByRole("button",{name:"Save",exact:true}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const removed=(await (await page.request.get("/api/admin/nodes")).json()).nodes.find((n:{id:string})=>n.id==="e2e-traffic");
    expect(removed.traffic).toBeUndefined();
  } finally {await page.request.delete(path);}
});
