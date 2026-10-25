import SequenceDetailView from "@/components/email/sequences/SequenceDetailView";

export const metadata = { title: "Séquence · Email Hub" };

export default async function EmailHubSequencePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <SequenceDetailView id={id} />;
}
