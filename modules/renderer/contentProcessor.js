// modules/renderer/contentProcessor.js

let mainRefs = {};

/**
 * Initializes the content processor with necessary references.
 * @param {object} refs - References to main modules and utilities.
 */
function initializeContentProcessor(refs) {
    mainRefs = refs;
}

/**
 * Ensures that triple backticks for code blocks are followed by a newline.
 * @param {string} text The input string.
 * @returns {string} The processed string with newlines after ``` if they were missing.
 */
function ensureNewlineAfterCodeBlock(text) {
    if (typeof text !== 'string') return text;
    // Replace ``` (possibly with leading spaces) not followed by \n or \r\n with the same ``` (and spaces) followed by \n
    return text.replace(/^(\s*```)(?![\r\n])/gm, '$1\n');
}

/**
 * Ensures that a tilde (~) is followed by a space.
 * @param {string} text The input string.
 * @returns {string} The processed string with spaces after tildes where they were missing.
 */
function ensureSpaceAfterTilde(text) {
    if (typeof text !== 'string') return text;
    // Replace ~ not followed by a space with ~ followed by a space
    return text.replace(/~(?![\s~])/g, '~ ');
}

/**
 * Removes leading whitespace from lines starting with ``` (code block markers).
 * @param {string} text The input string.
 * @returns {string} The processed string.
 */
function removeIndentationFromCodeBlockMarkers(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/^(\s*)(```.*)/gm, '$2');
}

/**
 * Removes speaker tags like "[Sender's speech]: " from the beginning of a string.
 * @param {string} text The input string.
 * @returns {string} The processed string without the leading speaker tag.
 */
function removeSpeakerTags(text) {
    if (typeof text !== 'string') return text;
    const speakerTagRegex = /^\[(?:(?!\]:\s).)*的发言\]:\s*/;
    let newText = text;
    // Loop to remove all occurrences of the speaker tag at the beginning of the string
    while (speakerTagRegex.test(newText)) {
        newText = newText.replace(speakerTagRegex, '');
    }
    return newText;
}

/**
* Ensures there is a separator between an <img> tag and a subsequent code block fence (```).
* This prevents the markdown parser from failing to recognize the code block.
* It inserts a double newline and an HTML comment. The comment acts as a "hard" separator
* for the markdown parser, forcing it to reset its state after the raw HTML img tag.
* @param {string} text The input string.
* @returns {string} The processed string.
*/
function ensureSeparatorBetweenImgAndCode(text) {
    if (typeof text !== 'string') return text;
    // Looks for an <img> tag, optional whitespace, and then a ```.
    // Inserts a double newline and an HTML comment.
    return text.replace(/(<img[^>]+>)\s*(```)/g, '$1\n\n<!-- VCP-Renderer-Separator -->\n\n$2');
}


/**
 * Parses VCP tool_name from content.
 * @param {string} toolContent - The raw string content of the tool request.
 * @returns {string|null} The extracted tool name or null.
 */
function extractVcpToolName(toolContent) {
    const match = toolContent.match(/tool_name:\s*「始」([^「」]+)「末」/);
    return match ? match[1] : null;
}

/**
 * Prettifies a single <pre> code block for DailyNote or VCP ToolUse.
 * @param {HTMLElement} preElement - The <pre> element to prettify.
 * @param {'dailynote' | 'vcptool'} type - The type of block.
 * @param {string} relevantContent - The relevant text content for the block.
 */
function prettifySinglePreElement(preElement, type, relevantContent) {
    if (!preElement || preElement.dataset.vcpPrettified === "true" || preElement.dataset.maidDiaryPrettified === "true") {
        return;
    }

    let targetContentElement = preElement.querySelector('code') || preElement;

    const copyButton = targetContentElement.querySelector('.code-copy, .fa-copy');
    if (copyButton) {
        copyButton.remove(); // Remove existing copy button
    }

    if (type === 'vcptool') {
        preElement.classList.add('vcp-tool-use-bubble');
        const toolName = extractVcpToolName(relevantContent);

        let newInnerHtml = `<span class="vcp-tool-label">ToolUse:</span>`;
        if (toolName) {
            newInnerHtml += `<span class="vcp-tool-name-highlight">${toolName}</span>`;
        } else {
            newInnerHtml += `<span class="vcp-tool-name-highlight">UnknownTool</span>`;
        }

        targetContentElement.innerHTML = newInnerHtml;
        preElement.dataset.vcpPrettified = "true";

    } else if (type === 'dailynote') {
        preElement.classList.add('maid-diary-bubble');
        let actualNoteContent = relevantContent.trim();

        let finalHtml = "";
        const lines = actualNoteContent.split('\n');
        const firstLineTrimmed = lines[0] ? lines[0].trim() : "";

        if (firstLineTrimmed.startsWith('Maid:')) {
            finalHtml = `<span class="maid-label">${lines.shift().trim()}</span>`;
            finalHtml += lines.join('\n');
        } else if (firstLineTrimmed.startsWith('Maid')) {
            finalHtml = `<span class="maid-label">${lines.shift().trim()}</span>`;
            finalHtml += lines.join('\n');
        } else {
            finalHtml = actualNoteContent;
        }

        targetContentElement.innerHTML = finalHtml.replace(/\n/g, '<br>');
        preElement.dataset.maidDiaryPrettified = "true";
    }
}

/**
 * Highlights @tag patterns within the text nodes of a given HTML element.
 * @param {HTMLElement} messageElement - The HTML element containing the message content.
 */
function highlightTagsInMessage(messageElement) {
    if (!messageElement) return;

    const tagRegex = /@([\u4e00-\u9fa5A-Za-z0-9_]+)/g;
    const walker = document.createTreeWalker(
        messageElement,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    const nodesToProcess = [];

    while (node = walker.nextNode()) {
        if (node.parentElement.tagName === 'STYLE' ||
            node.parentElement.tagName === 'SCRIPT' ||
            node.parentElement.classList.contains('highlighted-tag')) {
            continue;
        }

        const text = node.nodeValue;
        let match;
        const matches = [];
        tagRegex.lastIndex = 0;
        while ((match = tagRegex.exec(text)) !== null) {
            matches.push({
                index: match.index,
                tagText: match[0],
                tagName: match[1]
            });
        }

        if (matches.length > 0) {
            nodesToProcess.push({ node, matches });
        }
    }

    for (let i = nodesToProcess.length - 1; i >= 0; i--) {
        const { node, matches } = nodesToProcess[i];
        let currentNode = node;

        for (let j = matches.length - 1; j >= 0; j--) {
            const matchInfo = matches[j];
            const textAfterMatch = currentNode.splitText(matchInfo.index + matchInfo.tagText.length);

            const span = document.createElement('span');
            span.className = 'highlighted-tag';
            span.textContent = matchInfo.tagText;

            currentNode.parentNode.insertBefore(span, textAfterMatch);
            currentNode.nodeValue = currentNode.nodeValue.substring(0, matchInfo.index);
        }
    }
}

/**
 * Highlights text within double quotes in a given HTML element.
 * @param {HTMLElement} messageElement - The HTML element containing the message content.
 */
function highlightQuotesInMessage(messageElement) {
    if (!messageElement) return;

    const quoteRegex = /(?:"([^"]*)"|“([^”]*)”)/g; // Matches English "..." and Chinese “...”
    const walker = document.createTreeWalker(
        messageElement,
        NodeFilter.SHOW_TEXT,
        (node) => { // Filter to exclude nodes inside already highlighted quotes or tags, or style/script/pre/code/katex
            let parent = node.parentElement;
            while (parent && parent !== messageElement && parent !== document.body) {
                if (parent.classList.contains('highlighted-quote') ||
                    parent.classList.contains('highlighted-tag') ||
                    parent.classList.contains('katex') ||
                    parent.tagName === 'STYLE' ||
                    parent.tagName === 'SCRIPT' ||
                    parent.tagName === 'PRE' ||
                    parent.tagName === 'CODE') {
                    return NodeFilter.FILTER_REJECT;
                }
                parent = parent.parentElement;
            }
            return NodeFilter.FILTER_ACCEPT;
        },
        false
    );

    let node;
    const nodesToProcess = [];

    while (node = walker.nextNode()) {
        const text = node.nodeValue;
        let match;
        const matches = [];
        quoteRegex.lastIndex = 0; // Reset regex state for each node
        while ((match = quoteRegex.exec(text)) !== null) {
            const contentGroup1 = match[1];
            const contentGroup2 = match[2];
            if ((contentGroup1 && contentGroup1.length > 0) || (contentGroup2 && contentGroup2.length > 0)) {
                matches.push({
                    index: match.index,
                    fullMatch: match[0],
                });
            }
        }

        if (matches.length > 0) {
            nodesToProcess.push({ node, matches });
        }
    }

    // Process nodes in reverse to avoid issues with DOM modification
    for (let i = nodesToProcess.length - 1; i >= 0; i--) {
        const { node, matches } = nodesToProcess[i];
        let currentNode = node;

        // Process matches for a single node in reverse to keep indices valid
        for (let j = matches.length - 1; j >= 0; j--) {
            const matchInfo = matches[j];

            // Split the text node after the match
            const textAfterNode = currentNode.splitText(matchInfo.index + matchInfo.fullMatch.length);

            // Create the highlighted span
            const span = document.createElement('span');
            span.className = 'highlighted-quote';
            span.textContent = matchInfo.fullMatch;

            // Insert the new span before the text that followed the match
            currentNode.parentNode.insertBefore(span, textAfterNode);

            // Truncate the original node to remove the matched text from its end
            currentNode.nodeValue = currentNode.nodeValue.substring(0, matchInfo.index);
        }
    }
}

/**
 * Processes all relevant <pre> blocks within a message's contentDiv AFTER marked.parse().
 * @param {HTMLElement} contentDiv - The div containing the parsed Markdown.
 */
function processAllPreBlocksInContentDiv(contentDiv) {
    if (!contentDiv) return;

    const allPreElements = contentDiv.querySelectorAll('pre');
    allPreElements.forEach(preElement => {
        if (preElement.dataset.vcpPrettified === "true" || preElement.dataset.maidDiaryPrettified === "true") {
            return; // Already processed
        }

        const codeElement = preElement.querySelector('code');
        const blockText = codeElement ? (codeElement.textContent || "") : (preElement.textContent || "");

        // Check for VCP Tool Request
        if (blockText.includes('<<<[TOOL_REQUEST]>>>') && blockText.includes('<<<[END_TOOL_REQUEST]>>>')) {
            const vcpContentMatch = blockText.match(/<<<\[TOOL_REQUEST\]>>>([\s\S]*?)<<<\[END_TOOL_REQUEST\]>>>/);
            const actualVcpText = vcpContentMatch ? vcpContentMatch[1].trim() : "";
            prettifySinglePreElement(preElement, 'vcptool', actualVcpText);
        }
        // Check for DailyNote
        else if (blockText.includes('<<<DailyNoteStart>>>') && blockText.includes('<<<DailyNoteEnd>>>')) {
            const dailyNoteContentMatch = blockText.match(/<<<DailyNoteStart>>>([\s\S]*?)<<<DailyNoteEnd>>>/);
            const actualDailyNoteText = dailyNoteContentMatch ? dailyNoteContentMatch[1].trim() : "";
            prettifySinglePreElement(preElement, 'dailynote', actualDailyNoteText);
        }
    });
}

/**
 * Applies all post-render processing to the message content.
 * @param {HTMLElement} contentDiv The message content element.
 */
function processRenderedContent(contentDiv) {
    if (!contentDiv) return;

    // KaTeX rendering
    if (window.renderMathInElement) {
        window.renderMathInElement(contentDiv, {
            delimiters: [
                {left: "$$", right: "$$", display: true}, {left: "$", right: "$", display: false},
                {left: "\\(", right: "\\)", display: false}, {left: "\\[", right: "\\]", display: true}
            ],
            throwOnError: false
        });
    }

    // Special block formatting (VCP/Diary)
    processAllPreBlocksInContentDiv(contentDiv);

    // Highlighting must run after KaTeX and other DOM manipulations
    highlightTagsInMessage(contentDiv);
    highlightQuotesInMessage(contentDiv);

    // Apply syntax highlighting to code blocks
    if (window.hljs) {
        contentDiv.querySelectorAll('pre code').forEach((block) => {
            // Only highlight if the block hasn't been specially prettified (e.g., DailyNote or VCP ToolUse)
            if (!block.parentElement.dataset.vcpPrettified && !block.parentElement.dataset.maidDiaryPrettified) {
                window.hljs.highlightElement(block);
            }
        });
    }
}


export {
    initializeContentProcessor,
    ensureNewlineAfterCodeBlock,
    ensureSpaceAfterTilde,
    removeIndentationFromCodeBlockMarkers,
    removeSpeakerTags,
    ensureSeparatorBetweenImgAndCode,
    processAllPreBlocksInContentDiv,
    highlightTagsInMessage,
    highlightQuotesInMessage,
    processRenderedContent
};