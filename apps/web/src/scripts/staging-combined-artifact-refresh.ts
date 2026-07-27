import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { prepareStagingCombinedArtifactRefresh, STAGING_COMBINED_REFRESH_REPORT_IDS } from "@/db/staging-combined-artifact-refresh";
import { prepareStagingCommand } from "./staging-guard";

function argument(name:string):string|undefined{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;}

try{
  await prepareStagingCommand({environment:process.env,ensureDatabase,getDatabaseStatus:getDatabaseEnvironmentStatus});
  const reportId=argument("--report");
  if(!reportId||!STAGING_COMBINED_REFRESH_REPORT_IDS.includes(reportId as typeof STAGING_COMBINED_REFRESH_REPORT_IDS[number]))throw new Error(`--report must equal one of: ${STAGING_COMBINED_REFRESH_REPORT_IDS.join(", ")}.`);
  const result=await prepareStagingCombinedArtifactRefresh(reportId,argument("--from-revision"));
  process.stdout.write(`${JSON.stringify({reportId:result.reportId,jobId:result.jobId,artifactRevisionId:result.artifactRevisionId,
    artifactRevision:result.artifactRevision,sourceArtifactRevisionId:result.sourceArtifactRevisionId})}\n`);
}finally{await closeDatabase();}
