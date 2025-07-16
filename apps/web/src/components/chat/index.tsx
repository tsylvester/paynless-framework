import { Textarea } from "@/components/ui/textarea";
import { AIModelSelectorList } from '@/components/dialectic/AIModelSelectorList';

export default function Chat() {
	return (
		<div className="flex flex-col items-center justify-between align-center mx-20 py-20 min-h-screen">
            <div>line</div>
            <div><AIModelSelectorList /></div>
			<Textarea
				className="bg-[#121212] p-5 border-[#222] focus:border-[#333]"
				placeholder="Type your message..."
				autoFocus={true}
			/>
		</div>
	);
}
