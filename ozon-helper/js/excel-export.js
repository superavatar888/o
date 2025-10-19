function exportToExcel(products) {
    // 准备表头
    const headers = [
      "SKU", "商品名称", "价格(卢布)", "月销量", 
      "转化率(%)", "跟卖人数", "上架时间", 
      "佣金(卢布)", "Ozon链接"
    ];
    
    // 准备数据
    const data = products.map(p => [
      p.sku,
      p.name,
      p.price,
      p.monthlySales || '0',
      p.conversionRate || '0%',
      p.sellerCount || '0',
      p.createDate || '未知',
      p.commission || '0₽',
      p.url
    ]);
  
    // 创建工作簿
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    
    // 设置列宽
    ws['!cols'] = [
      {wch: 15}, {wch: 40}, {wch: 12},
      {wch: 12}, {wch: 12}, {wch: 12},
      {wch: 12}, {wch: 12}, {wch: 50}
    ];
    
    // 添加到工作簿
    XLSX.utils.book_append_sheet(wb, ws, "选品结果");
    
    // 生成文件名（含当前日期）
    const date = new Date();
    const dateStr = `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日`;
    
    // 导出文件
    XLSX.writeFile(wb, `Ozon选品结果_${dateStr}.xlsx`);
  }
