import "server-only";
import { NextResponse } from "next/server";
import { hasCapability } from "@brightloop/schema";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Body={action:"approve"|"revoke"|"bind"|"issue";expectedUpdatedAt:string;clientId?:string};
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await getActor(); if(!actor)return NextResponse.json({error:"Not signed in"},{status:401});
 const body=await request.json().catch(()=>null) as Body|null;
 if(!body||!["approve","revoke","bind","issue"].includes(body.action)||typeof body.expectedUpdatedAt!=="string")return NextResponse.json({error:"Invalid request"},{status:400});
 const needsApprove=body.action!=="bind"; const needsClients=body.action==="bind"||body.action==="issue";
 if((needsApprove&&!hasCapability(actor.role,"transformation.approve"))||(needsClients&&!hasCapability(actor.role,"clients.update")))return NextResponse.json({error:"Forbidden"},{status:403});
 const {id}=await params; const supabase=await createClient();
 const call=body.action==="bind"
  ? await supabase.rpc("bl_bind_proposal_quote_client",{p_quote_id:id,p_client_id:body.clientId??"",p_expected_updated_at:body.expectedUpdatedAt})
  : body.action==="issue"
   ? await supabase.rpc("bl_issue_canonical_proposal",{p_quote_id:id,p_expected_updated_at:body.expectedUpdatedAt})
   : await supabase.rpc("bl_review_proposal_quote",{p_quote_id:id,p_expected_updated_at:body.expectedUpdatedAt,p_action:body.action});
 if(call.error){const status=call.error.code==="40001"?409:call.error.code==="42501"?403:call.error.code==="P0002"?404:400;return NextResponse.json({error:call.error.message},{status});}
 const result=call.data?.[0]; if(!result)return NextResponse.json({error:"Operation returned no result"},{status:500});
 return NextResponse.json(body.action==="issue"?{proposalId:result.proposal_id,proposalNumber:result.proposal_number,outcome:result.outcome,itemCount:result.item_count}:{quoteId:result.quote_id,clientId:result.client_id,updatedAt:result.updated_at,status:result.status});
}
