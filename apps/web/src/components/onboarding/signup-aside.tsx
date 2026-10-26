import Image from 'next/image';

const PROOF = [
  ['Weekly briefs', 'with evidence'],
  ['Your brand', 'not ours'],
  ['Map rankings', 'every week'],
] as const;

/** Right panel of sign-up and invite-link pages: the owner-picked illustration and three proof points (spec 16 §5, O14). */
export function SignupAside() {
  return (
    <div className="flex flex-col items-center gap-7 px-10">
      <Image
        src="/onboarding/signup.webp" alt="A row of local shops and service vans on a quiet street, with map pins tracing an upward line above the rooftops."
        width={800} height={800} priority className="size-[340px] rounded-xl"
      />
      <ul className="flex flex-wrap justify-center gap-x-7 gap-y-2 text-[13px] text-muted-ink">
        {PROOF.map(([strong, rest]) => <li key={strong}><b className="font-semibold text-ink">{strong}</b> {rest}</li>)}
      </ul>
    </div>
  );
}
