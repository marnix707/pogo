/** Share the join link of a lobby (the phone's share sheet, else copy it). Returns true when the link was copied. */
export async function shareRoomLink(code: string): Promise<boolean> {
  const link = `${window.location.origin}/?join=${code}`;
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Join my POGO game',
        text: `Join me on POGO! Code: ${code}`,
        url: link,
      });
      return false;
    }
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    // Share sheet dismissed or clipboard blocked: nothing to do.
    return false;
  }
}
