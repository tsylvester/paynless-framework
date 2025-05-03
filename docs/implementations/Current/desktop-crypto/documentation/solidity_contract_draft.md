// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract EncryptedContentRegistry {

    struct ContentMetadata {
        bytes32 encryptedFileHash; // hash or CID (e.g., IPFS) of the encrypted content
        address keyNFTAddress;     // address of NFT contract controlling access
        address creator;           // original creator address (for royalties maybe)
        uint256 createdAt;         // timestamp
        string pointerURI;         // optional: IPFS URI, Arweave TX ID, etc.
    }

    mapping(uint256 => ContentMetadata) public contentRegistry;
    uint256 public nextContentID = 1;

    event ContentRegistered(uint256 indexed contentID, address indexed creator, address keyNFTAddress);

    function registerContent(
        bytes32 _encryptedFileHash,
        address _keyNFTAddress,
        string memory _pointerURI
    ) external returns (uint256) {
        uint256 contentID = nextContentID++;
        contentRegistry[contentID] = ContentMetadata({
            encryptedFileHash: _encryptedFileHash,
            keyNFTAddress: _keyNFTAddress,
            creator: msg.sender,
            createdAt: block.timestamp,
            pointerURI: _pointerURI
        });

        emit ContentRegistered(contentID, msg.sender, _keyNFTAddress);
        return contentID;
    }

    function getContentMetadata(uint256 _contentID) external view returns (ContentMetadata memory) {
        return contentRegistry[_contentID];
    }
}
