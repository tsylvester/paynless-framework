import { Textarea } from "@/components/ui/textarea";
import { AIModelSelectorList } from '@/components/dialectic/AIModelSelectorList';
import { DomainMultiSelector } from './DomainMultiSelector';
import { useDialecticStore } from "@paynless/store";
import { useQuery } from "@tanstack/react-query";
import { useState } from 'react';

export default function Chat() {

const {domains,fetchDomains} = useDialecticStore(state => ({
	domains: state.domains,
	fetchDomains: state.fetchDomains
}));

const [selectedDomainId, setSelectedDomainId] = useState<string>('');

useQuery({
		queryKey: ["domains"],
		queryFn: () => fetchDomains(),
	});

console.log("domains", domains);
console.log("selected domain id", selectedDomainId);

	return (
		<div className="flex flex-col items-center justify-between align-center mx-20 py-20 min-h-screen">
            <div>
				<h3 className="text-lg font-medium mb-4">Select Domain</h3>
				<DomainMultiSelector
					selectedDomainId={selectedDomainId}
					onSelectionChange={setSelectedDomainId}
					placeholder="Choose a domain..."
				/>
			</div>
            <div><AIModelSelectorList /></div>
			<Textarea
				className="bg-[#121212] p-5 border-[#222] focus:border-[#333]"
				placeholder="Type your message..."
				autoFocus={true}
			/>
		</div>
	);
}
