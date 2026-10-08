// A path selects only an owned original commitment/revision. Closed source
// configuration precedes Auth; keyed verified identity remounts transient frames.
import {redirect} from 'next/navigation'
import AccountShell from '../../../../../../components/account/AccountShell'
import LongCollectionRecovery from '../../../../../../components/account/LongCollectionRecovery'
import {configuredLongCollectionWebsite} from '../../../../../../lib/server/account-long-collection'
import {createClient} from '../../../../../../lib/supabase/server'
export const dynamic='force-dynamic'
export default async function CollectionPage({params}:{params:Promise<{commitmentId:string;revision:string}>}){const {commitmentId,revision}=await params,selected=configuredLongCollectionWebsite();if(!selected)return <AccountShell activePage="tasks" unavailable><LongCollectionRecovery enabled={false} commitmentId={commitmentId} commitmentRevision={Number(revision)}/></AccountShell>;const supabase=await createClient(),{data,error}=await supabase.auth.getUser();if(error||!data.user)redirect('/account/sign-in');return <AccountShell activePage="tasks"><LongCollectionRecovery key={data.user.id+':'+commitmentId+':'+revision} enabled ownerId={data.user.id} commitmentId={commitmentId} commitmentRevision={Number(revision)} publishableKey={selected.bindings.publishableKey}/></AccountShell>}
