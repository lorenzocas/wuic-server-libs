using System.Text;
using System.Text.RegularExpressions;

namespace WuicRagEngine;

/// <summary>Loader minimale di file .npy (numpy v1.0) per matrici float32 2D C-order.</summary>
public static class Npy
{
    public static float[] LoadF32Matrix(string path, out int rows, out int cols)
    {
        using var fs = File.OpenRead(path);
        using var br = new BinaryReader(fs);
        var magic = br.ReadBytes(6); // \x93NUMPY
        if (magic[0] != 0x93 || Encoding.ASCII.GetString(magic, 1, 5) != "NUMPY")
            throw new InvalidDataException("not a .npy file");
        byte major = br.ReadByte(); br.ReadByte(); // version
        int headerLen = major == 1 ? br.ReadUInt16() : (int)br.ReadUInt32();
        string header = Encoding.ASCII.GetString(br.ReadBytes(headerLen));
        // header es: {'descr': '<f4', 'fortran_order': False, 'shape': (8081, 1024), }
        if (!header.Contains("<f4")) throw new InvalidDataException($"expected <f4, header={header}");
        if (header.Contains("True")) throw new InvalidDataException("fortran_order not supported");
        var m = Regex.Match(header, @"'shape':\s*\((\d+),\s*(\d+)\)");
        if (!m.Success) throw new InvalidDataException($"cannot parse shape from {header}");
        rows = int.Parse(m.Groups[1].Value);
        cols = int.Parse(m.Groups[2].Value);
        long n = (long)rows * cols;
        var data = new float[n];
        var buf = br.ReadBytes((int)(n * 4));
        Buffer.BlockCopy(buf, 0, data, 0, buf.Length);
        return data;
    }
}
