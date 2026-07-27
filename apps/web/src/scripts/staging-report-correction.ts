import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { confirmApprovedReportCorrection, prepareApprovedReportCorrection } from "@/db/report-corrections";
import { prepareStagingCommand } from "./staging-guard";

async function main() {
  await prepareStagingCommand({ environment: process.env, ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus });
  const command=process.argv[2];
  try {
    if(command==="prepare") {
      console.log(JSON.stringify({ok:true,...await prepareApprovedReportCorrection()},null,2));
      return;
    }
    if(command==="confirm") {
      const file=argument("--questions-file");
      if(!file) throw new Error("--questions-file is required.");
      const payload=JSON.parse(await readFile(file,"utf8")) as {questions?:unknown;acknowledgedLowConfidence?:unknown};
      if(!Array.isArray(payload.questions)||payload.questions.length!==3||!payload.questions.every((value)=>typeof value==="string")||typeof payload.acknowledgedLowConfidence!=="boolean") throw new Error("The question file must contain exactly three strings and acknowledgedLowConfidence.");
      console.log(JSON.stringify({ok:true,...await confirmApprovedReportCorrection({finalTexts:payload.questions as string[],acknowledgedLowConfidence:payload.acknowledgedLowConfidence})},null,2));
      return;
    }
    throw new Error("Use prepare or confirm.");
  } finally { await closeDatabase(); }
}
function argument(name:string){const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main().catch((error)=>{console.error(error instanceof Error?error.message:"Correction command failed.");process.exitCode=1;});
