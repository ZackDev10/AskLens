from app.ingestion.chunker import chunk_pages, split_text
from app.ingestion.loaders import Page

LONG = " ".join(f"Sentence number {i} talks about returns and refunds." for i in range(80))


def test_short_text_is_one_chunk():
    assert split_text("Hello world, this is short.", 300, 50) == ["Hello world, this is short."]


def test_chunks_respect_size_and_cover_all_text():
    chunks = split_text(LONG, 300, 50)
    assert len(chunks) > 5
    assert all(len(c) <= 300 for c in chunks)
    # every sentence survives somewhere
    joined = " ".join(chunks)
    assert all(f"number {i} " in joined for i in range(80))


def test_overlap_repeats_text_between_neighbours():
    chunks = split_text(LONG, 300, 60)
    tail_words = chunks[0].split()[-3:]
    assert " ".join(tail_words) in chunks[1]


def test_no_overlap_option():
    chunks = split_text(LONG, 300, 0)
    assert all(len(c) <= 300 for c in chunks)


def test_paragraph_boundaries_preferred():
    text = ("A" * 200 + "\n\n") + ("B" * 200)
    chunks = split_text(text, 250, 0)
    assert chunks == ["A" * 200, "B" * 200]


def test_unbroken_text_is_hard_cut():
    chunks = split_text("x" * 1000, 300, 0)
    assert all(len(c) <= 300 for c in chunks) and sum(len(c) for c in chunks) == 1000


def test_arabic_and_french_are_handled():
    ar = " ".join(["التوصيل إلى الدار البيضاء يستغرق يومين إلى ثلاثة أيام عمل."] * 20)
    fr = " ".join(["Vous pouvez retourner un article sous 30 jours après la livraison."] * 20)
    for text in (ar, fr):
        chunks = split_text(text, 300, 50)
        assert len(chunks) > 1 and all(len(c) <= 300 for c in chunks)


def test_chunk_pages_keeps_page_numbers_and_sequential_index():
    pages = [Page(1, LONG[:700]), Page(2, ""), Page(3, LONG[:400])]
    chunks = chunk_pages(pages, 300, 50)
    assert [c.index for c in chunks] == list(range(len(chunks)))
    assert {c.page_number for c in chunks} == {1, 3}
    # page order is preserved
    assert [c.page_number for c in chunks] == sorted(c.page_number for c in chunks)


def test_tiny_fragments_are_dropped():
    assert chunk_pages([Page(None, "ok")], 300, 50) == []
