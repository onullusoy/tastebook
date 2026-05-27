import React from "react";

export default async function ListDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return <div>List Details Placeholder for {resolvedParams.id}</div>;
}
