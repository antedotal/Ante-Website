// Notices have a separately closed source read gate; no purpose is enabled here.
import {configuredPaymentNotices} from '../../../lib/server/account-payment-notices'
// The review gate precedes Auth; the owner key discards stale private UI state.
import {redirect} from 'next/navigation'
import AccountShell from '../../../components/account/AccountShell'
import AccountPaymentReview from '../../../components/account/AccountPaymentReview'
import {configuredPaymentReview} from '../../../lib/server/account-payment-review'
import {createClient} from '../../../lib/supabase/server'
export const dynamic='force-dynamic'
export default async function PaymentReviewPage(){const binding=configuredPaymentReview();if(!binding)return <AccountShell activePage="review" unavailable><AccountPaymentReview enabled={false}/></AccountShell>;const supabase=await createClient(),{data,error}=await supabase.auth.getUser();if(error||!data.user)redirect('/account/sign-in');return <AccountShell activePage="review"><AccountPaymentReview key={data.user.id} ownerId={data.user.id} noticesEnabled={!!configuredPaymentNotices()?.enabled} enabled/></AccountShell>}
