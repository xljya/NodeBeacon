import { Checkbox, Flex, Select, Text, TextField } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import type { TrafficConfig } from "@/lib/traffic";

export default function TrafficEditor({value,onChange}:{value:TrafficConfig|null;onChange:(v:TrafficConfig|null)=>void}) {
  const {t}=useTranslation();
  const enable = () => {
    const now=new Date();
    onChange({quota:0,unit:"GiB",mode:"sum",periodStart:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString(),periodEnd:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString(),resetVerified:false,calibration:{observedAt:now.toISOString(),rx:0,tx:0}});
  };
  return <Flex direction="column" gap="2" style={{borderTop:"1px solid var(--gray-5)",paddingTop:12}}>
    <label><Checkbox checked={!!value} onCheckedChange={checked=>checked ? enable() : onChange(null)} /> {t("traffic.configure")}</label>
    {value ? <>
      <Text size="1" color="gray">{t("traffic.editorHelp")}</Text>
      <label>{t("traffic.quota")}<TextField.Root type="number" min="0" step="any" value={value.quota} onChange={e=>onChange({...value,quota:Number(e.target.value)})} /></label>
      <Flex gap="2" wrap="wrap">
        <label>{t("traffic.unit")} <Select.Root value={value.unit} onValueChange={v=>onChange({...value,unit:v as TrafficConfig["unit"]})}><Select.Trigger /><Select.Content><Select.Item value="GiB">GiB (1024³)</Select.Item><Select.Item value="GB">GB (1000³)</Select.Item></Select.Content></Select.Root></label>
        <label>{t("traffic.mode")} <Select.Root value={value.mode} onValueChange={v=>onChange({...value,mode:v as TrafficConfig["mode"]})}><Select.Trigger /><Select.Content>{(["sum","max","tx","rx"] as const).map(mode=><Select.Item key={mode} value={mode}>{t(`traffic.${mode}`)}</Select.Item>)}</Select.Content></Select.Root></label>
      </Flex>
      {(["periodStart","periodEnd"] as const).map(key=><label key={key}>{t(`traffic.${key}`)} (UTC)<TextField.Root aria-label={t(`traffic.${key}`)} value={value[key]} onChange={e=>onChange({...value,[key]:e.target.value})} /></label>)}
      <label><Checkbox checked={value.resetVerified} onCheckedChange={v=>onChange({...value,resetVerified:!!v})} /> {t("traffic.verified")}</label>
      <label>{t("traffic.calibrated")} (UTC)<TextField.Root value={value.calibration.observedAt} onChange={e=>onChange({...value,calibration:{...value.calibration,observedAt:e.target.value}})} /></label>
      <Flex gap="2">
        {(["tx","rx"] as const).map(key=><label key={key} style={{minWidth:0}}>{t(`traffic.${key}`)} ({value.unit})<TextField.Root type="number" min="0" step="any" value={value.calibration[key]} onChange={e=>onChange({...value,calibration:{...value.calibration,[key]:Number(e.target.value)}})} /></label>)}
      </Flex>
    </> : null}
  </Flex>;
}
