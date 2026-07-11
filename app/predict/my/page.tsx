import { redirect } from 'next/navigation'

// "My Predict" has folded into the unified Activity hub. Keep the old URL working.
export default function MyPredictRedirect() {
  redirect('/activity')
}
