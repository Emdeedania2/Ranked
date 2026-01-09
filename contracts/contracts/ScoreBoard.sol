// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ScoreBoard
 * @dev On-chain registry for Degen vs Builder scores on Base
 * @notice This contract stores and verifies weekly scores for wallet activity classification
 */
contract ScoreBoard {
    // Score data for each wallet
    struct Score {
        uint256 builderScore;
        uint256 degenScore;
        uint256 lastUpdated;
    }

    // Owner of the contract (backend service)
    address public owner;

    // Mapping from wallet address to their scores
    mapping(address => Score) public scores;

    // Array to track all scored addresses for leaderboard
    address[] public scoredAddresses;
    mapping(address => bool) private hasScore;

    // Events
    event ScoreUpdated(
        address indexed user,
        uint256 builderScore,
        uint256 degenScore,
        uint256 timestamp
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event BatchScoresUpdated(uint256 count, uint256 timestamp);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "ScoreBoard: caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /**
     * @dev Update score for a single user
     * @param user The wallet address to update
     * @param builderScore The new builder score
     * @param degenScore The new degen score
     */
    function updateScore(
        address user,
        uint256 builderScore,
        uint256 degenScore
    ) external onlyOwner {
        _updateScore(user, builderScore, degenScore);
    }

    /**
     * @dev Batch update scores for multiple users
     * @param users Array of wallet addresses
     * @param builderScores Array of builder scores
     * @param degenScores Array of degen scores
     */
    function batchUpdateScores(
        address[] calldata users,
        uint256[] calldata builderScores,
        uint256[] calldata degenScores
    ) external onlyOwner {
        require(
            users.length == builderScores.length &&
                users.length == degenScores.length,
            "ScoreBoard: array length mismatch"
        );

        for (uint256 i = 0; i < users.length; i++) {
            _updateScore(users[i], builderScores[i], degenScores[i]);
        }

        emit BatchScoresUpdated(users.length, block.timestamp);
    }

    /**
     * @dev Internal function to update a user's score
     */
    function _updateScore(
        address user,
        uint256 builderScore,
        uint256 degenScore
    ) internal {
        if (!hasScore[user]) {
            scoredAddresses.push(user);
            hasScore[user] = true;
        }

        scores[user] = Score({
            builderScore: builderScore,
            degenScore: degenScore,
            lastUpdated: block.timestamp
        });

        emit ScoreUpdated(user, builderScore, degenScore, block.timestamp);
    }

    /**
     * @dev Get the builder score for a user
     */
    function getBuilderScore(address user) external view returns (uint256) {
        return scores[user].builderScore;
    }

    /**
     * @dev Get the degen score for a user
     */
    function getDegenScore(address user) external view returns (uint256) {
        return scores[user].degenScore;
    }

    /**
     * @dev Get full score data for a user
     */
    function getScore(address user) external view returns (Score memory) {
        return scores[user];
    }

    /**
     * @dev Get the total number of scored addresses
     */
    function getScoredAddressCount() external view returns (uint256) {
        return scoredAddresses.length;
    }

    /**
     * @dev Get a range of scored addresses (for pagination)
     * @param start Start index
     * @param count Number of addresses to return
     */
    function getScoredAddresses(
        uint256 start,
        uint256 count
    ) external view returns (address[] memory) {
        uint256 end = start + count;
        if (end > scoredAddresses.length) {
            end = scoredAddresses.length;
        }

        uint256 length = end - start;
        address[] memory result = new address[](length);

        for (uint256 i = 0; i < length; i++) {
            result[i] = scoredAddresses[start + i];
        }

        return result;
    }

    /**
     * @dev Transfer ownership of the contract
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ScoreBoard: new owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @dev Determine if user is more Builder or Degen
     * @return classification 1 for Builder, 2 for Degen, 0 for equal
     */
    function getClassification(address user) external view returns (uint8) {
        Score memory score = scores[user];
        if (score.builderScore > score.degenScore) {
            return 1; // Builder
        } else if (score.degenScore > score.builderScore) {
            return 2; // Degen
        }
        return 0; // Equal or no score
    }
}
