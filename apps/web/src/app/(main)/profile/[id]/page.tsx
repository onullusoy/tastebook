import React from "react";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return <div>Profile Placeholder for {resolvedParams.id}</div>;
}
