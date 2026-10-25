import {signInIssue} from "@/domain/organizer/sign-in-feedback";
import Link from "next/link";
import { notFound } from "next/navigation";
import { organizerAuthConfigured } from "@/lib/organizer-auth";
import { requireOrganizerPrincipal } from "@/server/organizer/studio-session";
import { OrganizerStudio } from "@/components/organizer/OrganizerStudio";
import { OrganizerSignIn } from "@/components/organizer/OrganizerSignIn";
import styles from "@/components/organizer/OrganizerStudio.module.css";
export const dynamic = "force-dynamic";
export const metadata = {title: "Organizer Studio | FutureFunded",robots:{index:false,follow:false}};
export default async function OrganizerPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{error?:string|string[]}>}) {
 const {slug} = await params;
 if (slug !== "connect-atx-elite") notFound();
 const issue=signInIssue((await searchParams).error);
 const configured = organizerAuthConfigured();
 const principal = configured ? await requireOrganizerPrincipal(slug) : null;
 return <main className={styles.page}><div className={styles.shell}>
   <header className={styles.header}><Link href="/" className={styles.brand}>FutureFunded <span>· Organizer Studio</span></Link>
     <div className={styles.headerAside}>Connect ATX Elite<span>Private development workspace</span></div></header>
   {!configured ? <section className={styles.intro}><h1>Organizer sign-in is not configured.</h1><p>Development-only credentials and schema verification are required. No campaign data has been changed.</p></section>
   : principal ? <OrganizerStudio slug={slug} organization="Connect ATX Elite" role={principal.role} publicEnabled={false}/>
   : <OrganizerSignIn key={issue??"sign-in"} slug={slug} initialIssue={issue}/>}
 </div></main>;
}
