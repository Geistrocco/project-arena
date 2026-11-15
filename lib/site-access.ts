import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

import {parseSiteAccess,type SiteAccess} from "@/lib/site-access-state";

export const getSiteAccess = cache(async (): Promise<SiteAccess> => {
  try {
    const supabase = await createClient();
    const {data,error} = await supabase.rpc("get_site_access");
    return parseSiteAccess(data,error);
  } catch { return {restricted:true,allowed:false}; }
});
