package org.dromara.ai.controller;

import lombok.RequiredArgsConstructor;
import org.dromara.ai.domain.entity.AiKnowledgeBase;
import org.dromara.ai.domain.entity.AiKnowledgeChunk;
import org.dromara.ai.domain.entity.AiKnowledgeDocument;
import org.dromara.ai.service.IAiKnowledgeService;
import org.dromara.common.core.domain.PageResult;
import org.dromara.common.core.domain.R;
import org.dromara.common.mybatis.core.page.PageQuery;
import org.dromara.common.web.core.BaseController;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 知识库管理、文档切片与 pgvector 向量检索控制器
 *
 * @author ruoyi
 */
@Validated
@RestController
@RequestMapping("/ai/knowledge")
@RequiredArgsConstructor
public class AiKnowledgeController extends BaseController {

    private final IAiKnowledgeService knowledgeService;

    /**
     * 分页查询知识库列表
     */
    @GetMapping("/bases")
    public R<PageResult<AiKnowledgeBase>> listBases(AiKnowledgeBase base, PageQuery pageQuery) {
        return R.ok(knowledgeService.selectBaseList(base, pageQuery));
    }

    /**
     * 获取全部可用知识库简要列表 (下拉选择使用)
     */
    @GetMapping("/base/all")
    public R<List<AiKnowledgeBase>> listAllBases() {
        return R.ok(knowledgeService.selectBaseListAll());
    }

    /**
     * 获取知识库详情
     */
    @GetMapping("/base/{id}")
    public R<AiKnowledgeBase> getBase(@PathVariable Long id) {
        return R.ok(knowledgeService.selectBaseById(id));
    }

    /**
     * 新增知识库
     */
    @PostMapping("/base")
    public R<Void> addBase(@RequestBody AiKnowledgeBase base) {
        return toAjax(knowledgeService.insertBase(base));
    }

    /**
     * 修改知识库
     */
    @PutMapping("/base")
    public R<Void> editBase(@RequestBody AiKnowledgeBase base) {
        return toAjax(knowledgeService.updateBase(base));
    }

    /**
     * 删除知识库
     */
    @DeleteMapping("/base/{id}")
    public R<Void> removeBase(@PathVariable Long id) {
        return toAjax(knowledgeService.deleteBaseById(id));
    }

    /**
     * 分页查询知识库下的文档列表
     */
    @GetMapping("/documents/{kbId}")
    public R<PageResult<AiKnowledgeDocument>> listDocuments(@PathVariable Long kbId, PageQuery pageQuery) {
        return R.ok(knowledgeService.selectDocumentList(kbId, pageQuery));
    }

    /**
     * 删除知识库文档
     */
    @DeleteMapping("/document/{id}")
    public R<Void> removeDocument(@PathVariable Long id) {
        return toAjax(knowledgeService.deleteDocumentById(id));
    }

    /**
     * 文本切片并执行 1536 维向量化入库 (pgvector)
     */
    @PostMapping("/chunk/text")
    public R<Map<String, Object>> chunkText(@RequestBody Map<String, Object> params) {
        Long kbId = Long.valueOf(params.get("kbId").toString());
        Long docId = params.get("docId") != null ? Long.valueOf(params.get("docId").toString()) : null;
        String title = params.get("title") != null ? params.get("title").toString() : null;
        String content = params.get("content") != null ? params.get("content").toString() : "";
        Integer chunkSize = params.get("chunkSize") != null ? Integer.valueOf(params.get("chunkSize").toString()) : null;
        Integer chunkOverlap = params.get("chunkOverlap") != null ? Integer.valueOf(params.get("chunkOverlap").toString()) : null;
        String chunkType = params.get("chunkType") != null ? params.get("chunkType").toString() : "text";
        String question = params.get("question") != null ? params.get("question").toString() : null;

        int count = knowledgeService.chunkAndSaveText(kbId, docId, title, content, chunkSize, chunkOverlap, chunkType, question);
        Map<String, Object> result = new HashMap<>();
        result.put("chunkCount", count);
        result.put("kbId", kbId);
        return R.ok(result);
    }

    /**
     * 分页查询切片明细列表
     */
    @GetMapping("/chunks/{kbId}")
    public R<PageResult<AiKnowledgeChunk>> listChunks(
        @PathVariable Long kbId,
        @RequestParam(required = false) Long docId,
        PageQuery pageQuery) {
        return R.ok(knowledgeService.selectChunkList(kbId, docId, pageQuery));
    }

    /**
     * 删除单条切片
     */
    @DeleteMapping("/chunk/{id}")
    public R<Void> removeChunk(@PathVariable Long id) {
        return toAjax(knowledgeService.deleteChunkById(id));
    }

    /**
     * pgvector 语义向量检索接口 (HNSW 余弦相似度)
     */
    @PostMapping("/search")
    public R<List<AiKnowledgeChunk>> searchChunks(@RequestBody Map<String, Object> params) {
        Long kbId = Long.valueOf(params.get("kbId").toString());
        String query = params.get("query") != null ? params.get("query").toString() : "";
        Integer topK = params.get("topK") != null ? Integer.valueOf(params.get("topK").toString()) : 5;
        Double minScore = params.get("minScore") != null ? Double.valueOf(params.get("minScore").toString()) : 0.0;

        List<AiKnowledgeChunk> list = knowledgeService.searchChunks(kbId, query, topK, minScore);
        return R.ok(list);
    }
}
