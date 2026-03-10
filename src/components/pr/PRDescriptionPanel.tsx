interface PRDescriptionPanelProps {
  body: string | null;
}

export function PRDescriptionPanel({ body }: PRDescriptionPanelProps) {
  const hasContent = body !== null && body !== "";

  return (
    <div className="text-xs text-gray-300" data-testid="pr-description-panel">
      {hasContent ? (
        <p className="whitespace-pre-wrap">{body}</p>
      ) : (
        <span className="text-gray-500">No description</span>
      )}
    </div>
  );
}
