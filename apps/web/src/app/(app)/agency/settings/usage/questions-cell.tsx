/** Ask questions used this UTC month vs the client's quota. Agency pages only (e4: clients never see usage). */
export function QuestionsCell({ questions }: { questions: { used: number; quota: number } }) {
  const over = questions.quota > 0 && questions.used >= questions.quota;
  return (
    <>
      <span>{`${questions.used} of ${questions.quota}`}</span>
      {over && <div className="text-amber-text">At quota</div>}
    </>
  );
}
