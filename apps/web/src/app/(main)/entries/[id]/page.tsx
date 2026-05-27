import React from "react";

export default async function EntryDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return <div>Entry Details Placeholder for {resolvedParams.id}</div>;
}
