export async function uploadImage(file: File): Promise<string> {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error || "Failed to upload image");
  }

  const { imageUrl } = await res.json();
  return imageUrl;
}
