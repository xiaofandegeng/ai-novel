import os

files_to_fix = [
    "ConflictMatrixView.vue",
    "OutlineView.vue",
    "RelationshipsView.vue",
    "KnowledgeBaseView.vue",
    "QualityReviewView.vue",
    "WritingView.vue"
]

base_path = "/Users/lhw/code/ai-novel/apps/web/src/views/"

for filename in files_to_fix:
    path = os.path.join(base_path, filename)
    if not os.path.exists(path):
        continue
    
    with open(path, 'r') as f:
        content = f.read()
    
    # Add ChevronLeft to lucide imports if not there
    if 'ChevronLeft' not in content:
        content = content.replace('ChevronRight,', 'ChevronLeft,\n  ChevronRight,')
        # Fallback if no ChevronRight
        if 'ChevronLeft' not in content:
             content = content.replace('import {', 'import {\n  ChevronLeft,')

    # Add back button to sidebars or headers
    # Looking for uppercase headers in sidebars
    if '<aside' in content:
        import re
        # Try to find the first <h2> inside an <aside> and insert a back button before it
        # Or find the pattern: uppercase"> ... </h2>
        content = re.sub(r'font-bold tracking-wider uppercase">\s*(<[^>]+>\s*)?([^<]+)\s*</h2>', 
                         r'font-bold tracking-wider uppercase">\n            <NButton variant="ghost" size="sm" class="-ml-2 h-8 w-8 p-0" @click="router.back()">\n              <ChevronLeft :size="18" />\n            </NButton>\n            \1\2\n          </h2>', 
                         content, count=1)

    with open(path, 'w') as f:
        f.write(content)

