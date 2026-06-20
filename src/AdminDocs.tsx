import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Download,
  ListTree,
  Search,
  X
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import adminGuide from "../docs/admin-guide.md?raw";
import adminGuideUrl from "../docs/admin-guide.md?url";

interface DocumentationTopic {
  id: string;
  title: string;
  content: string;
  searchText: string;
}

const document = {
  title: "Admin operating guide",
  description: "Daily booking, emergency control, resources, forms, Calendar, and privacy processes.",
  content: adminGuide,
  file: adminGuideUrl
} as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseTopics(markdown: string): DocumentationTopic[] {
  const withoutTitle = markdown.replace(/^# .+\r?\n+/, "");
  const sections = withoutTitle.split(/\n(?=## )/);
  const topics: DocumentationTopic[] = [];
  const introduction = sections.shift()?.trim();

  if (introduction) {
    topics.push({
      id: "overview",
      title: "Overview",
      content: `## Overview\n\n${introduction}`,
      searchText: introduction.toLowerCase()
    });
  }

  sections.forEach((section, index) => {
    const heading = section.match(/^##\s+(.+)$/m)?.[1]?.trim() || `Topic ${index + 1}`;
    topics.push({
      id: slugify(heading),
      title: heading,
      content: section.trim(),
      searchText: `${heading}\n${section}`.toLowerCase()
    });
  });

  return topics;
}

function updateDocumentationUrl(topicId: string) {
  const url = new URL(window.location.href);
  url.pathname = "/admin/docs";
  url.searchParams.delete("document");
  url.searchParams.set("topic", topicId);
  window.history.replaceState({}, "", url);
}

export default function AdminDocs() {
  const initialParams = new URLSearchParams(window.location.search);
  const [activeTopicId, setActiveTopicId] = useState(initialParams.get("topic") || "");
  const [query, setQuery] = useState("");
  const topics = useMemo(() => parseTopics(document.content), [document.content]);
  const visibleTopics = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? topics.filter((topic) => topic.searchText.includes(normalized)) : topics;
  }, [query, topics]);
  const selectedIndex = Math.max(0, topics.findIndex((topic) => topic.id === activeTopicId));
  const selectedTopic = topics[selectedIndex] || topics[0];

  useEffect(() => {
    if (!topics.length) return;
    const requestedTopic = topics.find((topic) => topic.id === activeTopicId);
    if (!requestedTopic) {
      setActiveTopicId(topics[0].id);
      updateDocumentationUrl(topics[0].id);
    }
  }, [activeTopicId, topics]);

  const chooseTopic = (topicId: string) => {
    setActiveTopicId(topicId);
    updateDocumentationUrl(topicId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const previousTopic = selectedIndex > 0 ? topics[selectedIndex - 1] : undefined;
  const nextTopic = selectedIndex < topics.length - 1 ? topics[selectedIndex + 1] : undefined;

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
        <div className="rounded-2xl bg-ink p-5 text-white shadow-card">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
              <BookOpen size={19} />
            </div>
            <div>
              <p className="text-sm font-extrabold">{document.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">{document.description}</p>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                <ListTree size={15} /> Topics
              </p>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{topics.length}</span>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-3 text-slate-400" size={15} />
              <input
                className="field min-h-10 py-2.5 pl-9 pr-9 text-xs"
                placeholder="Find a topic…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100"
                  onClick={() => setQuery("")}
                  aria-label="Clear topic search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <nav className="max-h-[48vh] overflow-y-auto p-2 xl:max-h-[calc(100vh-28rem)]" aria-label={`${document.title} topics`}>
            {visibleTopics.length ? (
              visibleTopics.map((topic) => (
                <button
                  className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                    selectedTopic?.id === topic.id
                      ? "bg-ink text-white shadow-md"
                      : "text-slate-600 hover:bg-slate-50 hover:text-ink"
                  }`}
                  onClick={() => chooseTopic(topic.id)}
                  key={topic.id}
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">{topic.title}</span>
                  <ChevronRight
                    className={selectedTopic?.id === topic.id ? "text-brand-300" : "text-slate-300 group-hover:text-brand-500"}
                    size={14}
                  />
                </button>
              ))
            ) : (
              <div className="px-3 py-8 text-center">
                <Search className="mx-auto text-slate-300" size={22} />
                <p className="mt-2 text-xs font-bold text-slate-500">No matching topics</p>
                <button className="mt-2 text-xs font-bold text-brand-600" onClick={() => setQuery("")}>Clear search</button>
              </div>
            )}
          </nav>
        </div>

        <div className="hidden rounded-2xl border border-emerald-100 bg-emerald-50 p-4 xl:block">
          <div className="flex gap-3">
            <CheckCircle2 className="shrink-0 text-emerald-600" size={18} />
            <div>
              <p className="text-xs font-extrabold text-emerald-900">Easy to maintain</p>
              <p className="mt-1 text-[11px] leading-5 text-emerald-800">
                Every level-two Markdown heading becomes a navigable topic automatically.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <section className="min-w-0">
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="eyebrow">{document.title}</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{selectedTopic?.title}</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Topic {selectedIndex + 1} of {topics.length}
                </p>
              </div>
              <a className="secondary-button min-h-10 shrink-0 px-4 py-2" href={document.file} download>
                <Download size={16} /> Download full guide
              </a>
            </div>
          </div>

          <article className="documentation min-h-[480px] p-5 sm:p-8 lg:p-10">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedTopic?.content || ""}</ReactMarkdown>
          </article>

          <div className="grid gap-3 border-t border-slate-100 bg-slate-50/70 p-5 sm:grid-cols-2 sm:p-6">
            {previousTopic ? (
              <button className="secondary-button min-h-16 justify-start px-4 text-left" onClick={() => chooseTopic(previousTopic.id)}>
                <ArrowLeft className="shrink-0" size={17} />
                <span>
                  <span className="block text-[10px] uppercase tracking-wider text-slate-400">Previous</span>
                  <span className="mt-0.5 block text-xs">{previousTopic.title}</span>
                </span>
              </button>
            ) : <div />}
            {nextTopic && (
              <button className="primary-button min-h-16 justify-end px-4 text-right" onClick={() => chooseTopic(nextTopic.id)}>
                <span>
                  <span className="block text-[10px] uppercase tracking-wider text-brand-200">Next</span>
                  <span className="mt-0.5 block text-xs">{nextTopic.title}</span>
                </span>
                <ArrowRight className="shrink-0" size={17} />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
